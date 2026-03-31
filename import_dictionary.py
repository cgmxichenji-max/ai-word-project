

import json
import re
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data" / "ai_word_system.db"
JSON_PATH = BASE_DIR / "gptwords.json"


# -----------------------------
# 通用文本处理
# -----------------------------
def clean_text(text: str) -> str:
    if not text:
        return ""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\u2028", "\n").replace("\u2029", "\n")
    text = text.replace("&nbsp;", " ")
    text = re.sub(r"\n[ \t]+\n", "\n\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()



def strip_md_marks(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"^\s*#+\s*", "", text, flags=re.M)
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"^[\-\*\u2022]\s+", "", text, flags=re.M)
    return text.strip()


# -----------------------------------------------
# JSON 解析宽松辅助
# -----------------------------------------------

def decode_json_escapes_safe(s: str) -> str:
    """
    只解码常见 JSON 转义和 \\uXXXX，避免把原本正常的 UTF-8 中文解坏。
    """
    if s is None:
        return ""

    def repl_unicode(m: re.Match) -> str:
        try:
            return chr(int(m.group(1), 16))
        except Exception:
            return m.group(0)

    # 先处理 \uXXXX
    s = re.sub(r'\\u([0-9a-fA-F]{4})', repl_unicode, s)

    # 再处理常见 JSON 转义
    s = s.replace(r'\"', '"')
    s = s.replace(r'\\', '\\')
    s = s.replace(r'\/', '/')
    s = s.replace(r'\n', '\n')
    s = s.replace(r'\r', '\r')
    s = s.replace(r'\t', '\t')
    s = s.replace(r'\b', '\b')
    s = s.replace(r'\f', '\f')
    return s


def parse_loose_chunk(chunk: str, index: int) -> dict:
    """
    宽松解析单条记录，兼容 content 中出现未转义控制字符的情况。
    假定结构固定为：{"word":"...","content":"..."}
    """
    pattern = re.compile(
        r'^\{"word":"(?P<word>(?:\\.|[^"\\])*)","content":"(?P<content>.*)"\}\s*$',
        re.S,
    )
    m = pattern.match(chunk)
    if not m:
        raise ValueError(f"gptwords.json 第 {index} 条记录无法按宽松规则解析")

    raw_word = m.group("word")
    raw_content = m.group("content")

    return {
        "word": decode_json_escapes_safe(raw_word),
        "content": decode_json_escapes_safe(raw_content),
    }




def split_ndjson_objects(text: str):
    """
    按每条记录开头 `{"word":` 来切分伪 NDJSON。
    兼容 content 中可能出现真实换行，避免逐行 json.loads 失败。
    """
    pattern = re.compile(r'(?m)^\{"word":')
    matches = list(pattern.finditer(text))

    if not matches:
        return []

    chunks = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
    return chunks


# -----------------------------
# 一级解析：按标题切块
# -----------------------------
SECTION_ALIASES = {
    "meaning_raw": ["分析词义", "词义分析"],
    "examples_raw": ["列举例句", "例句"],
    "word_root_raw": ["词根分析"],
    "affix_raw": ["词缀分析"],
    "history_raw": ["发展历史和文化背景"],
    "forms_raw": ["单词变形"],
    "memory_tip_raw": ["记忆辅助"],
    "story_raw": ["小故事"],
}


def find_heading_positions(text: str):
    patterns = []
    for field, aliases in SECTION_ALIASES.items():
        for alias in aliases:
            patterns.append((field, alias))

    hits = []
    for field, alias in patterns:
        regex = re.compile(
            rf"(?m)^[ \t]*(?:#+[ \t]*)?(?:\*\*)?{re.escape(alias)}(?:\*\*)?[：:]?[ \t]*$"
        )
        for m in regex.finditer(text):
            hits.append((m.start(), m.end(), field, alias))

    if not hits:
        for field, alias in patterns:
            regex = re.compile(rf"{re.escape(alias)}[：:]")
            for m in regex.finditer(text):
                hits.append((m.start(), m.end(), field, alias))

    hits.sort(key=lambda x: x[0])
    return hits


def parse_sections(content: str) -> dict:
    result = {
        "meaning_raw": None,
        "examples_raw": None,
        "word_root_raw": None,
        "affix_raw": None,
        "history_raw": None,
        "forms_raw": None,
        "memory_tip_raw": None,
        "story_raw": None,
        "parse_status": 0,
        "parse_note": None,
    }

    text = clean_text(strip_md_marks(content))
    hits = find_heading_positions(text)

    if not hits:
        result["meaning_raw"] = text
        result["parse_status"] = 2
        result["parse_note"] = "未识别到标准标题，meaning_raw 使用全文兜底"
        return result

    sections = {}
    for i, (start, end, field, _alias) in enumerate(hits):
        next_start = hits[i + 1][0] if i + 1 < len(hits) else len(text)
        body = text[end:next_start].strip()
        if not body:
            continue
        if sections.get(field):
            sections[field] = f"{sections[field]}\n\n{body}"
        else:
            sections[field] = body

    for k in [
        "meaning_raw",
        "examples_raw",
        "word_root_raw",
        "affix_raw",
        "history_raw",
        "forms_raw",
        "memory_tip_raw",
        "story_raw",
    ]:
        result[k] = sections.get(k)

    count = sum(
        1
        for k in [
            "meaning_raw",
            "examples_raw",
            "word_root_raw",
            "affix_raw",
            "history_raw",
            "forms_raw",
            "memory_tip_raw",
            "story_raw",
        ]
        if result[k]
    )

    if count >= 3:
        result["parse_status"] = 1
        result["parse_note"] = f"一级解析成功，识别 {count} 个字段"
    else:
        result["parse_status"] = 2
        result["parse_note"] = f"一级解析部分成功，识别 {count} 个字段"

    return result


# -----------------------------
# 二级解析：例句
# -----------------------------
def split_en_zh_line(line: str):
    original = line.strip()
    if not original:
        return None, None

    line = re.sub(r"^\s*(\d+[\.\)]|[*\-•])\s*", "", original).strip()
    line = line.strip().strip('"').strip("“”")

    m = re.match(r"^(.*?)[\s]*[-—–][\s]*(.+)$", line)
    if m:
        en = m.group(1).strip().strip('"').strip("“”")
        zh = m.group(2).strip().strip('"').strip("“”")
        return en or None, zh or None

    m = re.match(r"^(.*?)\s*[（(]\s*(.+?)\s*[）)]\s*$", line)
    if m:
        en = m.group(1).strip().strip('"').strip("“”")
        zh = m.group(2).strip().strip('"').strip("“”")
        return en or None, zh or None

    zh_pos = re.search(r"[\u4e00-\u9fff]", line)
    if zh_pos:
        idx = zh_pos.start()
        en = line[:idx].strip().strip('"').strip("“”")
        zh = line[idx:].strip().strip('"').strip("“”")
        return en or None, zh or None

    if re.search(r"[A-Za-z]", line):
        return line.strip(), None
    return None, line.strip()


def parse_examples(examples_raw: str):
    if not examples_raw:
        return []

    text = clean_text(strip_md_marks(examples_raw))
    lines = [x.strip() for x in text.split("\n") if x.strip()]

    chunks = []
    current = []
    has_numbered = any(re.match(r"^\s*(\d+[\.\)]|[*\-•])\s*", x) for x in lines)

    if has_numbered:
        for line in lines:
            if re.match(r"^\s*(\d+[\.\)]|[*\-•])\s*", line):
                if current:
                    chunks.append(" ".join(current))
                    current = []
                current.append(line)
            else:
                current.append(line)
        if current:
            chunks.append(" ".join(current))
    else:
        chunks = lines

    result = []
    for chunk in chunks:
        en, zh = split_en_zh_line(chunk)
        if en or zh:
            result.append((en, zh))
    return result


# -----------------------------
# 二级解析：故事
# -----------------------------
def parse_story(story_raw: str):
    if not story_raw:
        return []

    text = clean_text(strip_md_marks(story_raw))
    lines = [x.strip() for x in text.split("\n") if x.strip()]

    if len(lines) >= 2:
        first = " ".join(lines[:-1]).strip()
        last = lines[-1].strip()
        if re.search(r"[A-Za-z]", first) and re.search(r"[\u4e00-\u9fff]", last):
            return [(first, last)]

    m = re.match(r"^(.*?)\s*[（(]\s*(.+?)\s*[）)]\s*$", text, flags=re.S)
    if m:
        en = clean_text(m.group(1))
        zh = clean_text(m.group(2))
        return [(en or None, zh or None)]

    zh_pos = re.search(r"[\u4e00-\u9fff]", text)
    if zh_pos:
        idx = zh_pos.start()
        en = text[:idx].strip()
        zh = text[idx:].strip()
        if en or zh:
            return [(en or None, zh or None)]

    if re.search(r"[A-Za-z]", text):
        return [(text, None)]

    return [(None, text)]


# -----------------------------
# JSON 读取：支持 NDJSON / JSON 数组
# -----------------------------
def load_json_records(path: Path):
    text = path.read_text(encoding="utf-8")
    text = text.replace("\u2028", "\n").replace("\u2029", "\n").strip()

    # 先尝试标准 JSON 数组
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return [data]
    except json.JSONDecodeError:
        pass

    # 再尝试连续 JSON 对象流
    decoder = json.JSONDecoder()
    idx = 0
    stream_records = []
    try:
        while idx < len(text):
            while idx < len(text) and text[idx].isspace():
                idx += 1
            if idx >= len(text):
                break
            obj, end = decoder.raw_decode(text, idx)
            stream_records.append(obj)
            idx = end
        if stream_records:
            return stream_records
    except json.JSONDecodeError:
        pass

    # 最后按伪 NDJSON 方式切分，再逐条宽松解析。
    # 兼容 content 中存在未转义控制字符，但仍保持中文原文不乱码。
    chunks = split_ndjson_objects(text)
    records = []

    for i, chunk in enumerate(chunks, start=1):
        try:
            records.append(parse_loose_chunk(chunk, i))
        except Exception as e:
            preview = chunk[:300].replace("\n", "\\n")
            raise ValueError(
                f"gptwords.json 第 {i} 条记录无法按宽松规则解析：{e}\n"
                f"记录预览：{preview}"
            ) from e

    if not records:
        raise ValueError("未从 gptwords.json 读到任何有效记录")

    return records


# -----------------------------
# SQLite 写入
# -----------------------------
def ensure_tables(conn: sqlite3.Connection):
    required = {
        "users",
        "words",
        "user_words",
        "user_study_settings",
        "word_examples",
        "word_stories",
    }
    cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    existing = {row[0] for row in cur.fetchall()}
    missing = required - existing
    if missing:
        raise RuntimeError(f"缺少表：{missing}")


def clear_system_examples_stories(conn: sqlite3.Connection):
    conn.execute("DELETE FROM word_examples WHERE user_id IS NULL AND source_type='system'")
    conn.execute("DELETE FROM word_stories WHERE user_id IS NULL AND source_type='system'")


def upsert_word(conn: sqlite3.Connection, sort_order: int, word: str, content_raw: str, sections: dict):
    conn.execute(
        """
        INSERT INTO words (
            word, content_raw, meaning_raw, examples_raw, word_root_raw,
            affix_raw, history_raw, forms_raw, memory_tip_raw, story_raw,
            parse_status, parse_note, source_name, sort_order
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(word) DO UPDATE SET
            content_raw=excluded.content_raw,
            meaning_raw=excluded.meaning_raw,
            examples_raw=excluded.examples_raw,
            word_root_raw=excluded.word_root_raw,
            affix_raw=excluded.affix_raw,
            history_raw=excluded.history_raw,
            forms_raw=excluded.forms_raw,
            memory_tip_raw=excluded.memory_tip_raw,
            story_raw=excluded.story_raw,
            parse_status=excluded.parse_status,
            parse_note=excluded.parse_note,
            source_name=excluded.source_name,
            sort_order=excluded.sort_order
        """,
        (
            word,
            content_raw,
            sections.get("meaning_raw"),
            sections.get("examples_raw"),
            sections.get("word_root_raw"),
            sections.get("affix_raw"),
            sections.get("history_raw"),
            sections.get("forms_raw"),
            sections.get("memory_tip_raw"),
            sections.get("story_raw"),
            sections.get("parse_status", 0),
            sections.get("parse_note"),
            "DictionaryByGPT4",
            sort_order,
        ),
    )

    cur = conn.execute("SELECT id FROM words WHERE word = ?", (word,))
    return cur.fetchone()[0]


def insert_examples(conn: sqlite3.Connection, word_id: int, examples):
    for en, zh in examples:
        if not en and not zh:
            continue
        conn.execute(
            """
            INSERT INTO word_examples (word_id, user_id, example_en, example_zh, source_type)
            VALUES (?, NULL, ?, ?, 'system')
            """,
            (word_id, en, zh),
        )


def insert_stories(conn: sqlite3.Connection, word_id: int, stories):
    for en, zh in stories:
        if not en and not zh:
            continue
        conn.execute(
            """
            INSERT INTO word_stories (word_id, user_id, story_en, story_zh, source_type)
            VALUES (?, NULL, ?, ?, 'system')
            """,
            (word_id, en, zh),
        )


def main():
    if not DB_PATH.exists():
        raise FileNotFoundError(f"数据库不存在：{DB_PATH}")
    if not JSON_PATH.exists():
        raise FileNotFoundError(f"JSON 不存在：{JSON_PATH}")

    data = load_json_records(JSON_PATH)
    print(f"成功读取记录数: {len(data)}")
    print("开始写入数据库...")

    conn = sqlite3.connect(DB_PATH)
    try:
        ensure_tables(conn)
        clear_system_examples_stories(conn)
        # 重新导入时，先清空 words，再重建系统解析结果，避免保留上一次的乱码数据
        conn.execute("DELETE FROM words")
        conn.execute("DELETE FROM sqlite_sequence WHERE name='words'")

        total = 0
        ex_count = 0
        st_count = 0

        for idx, item in enumerate(data, start=1):
            word = clean_text(item.get("word", ""))
            content_raw = clean_text(item.get("content", ""))

            if not word or not content_raw:
                continue

            sections = parse_sections(content_raw)
            word_id = upsert_word(conn, idx, word, content_raw, sections)

            examples = parse_examples(sections.get("examples_raw") or "")
            stories = parse_story(sections.get("story_raw") or "")

            insert_examples(conn, word_id, examples)
            insert_stories(conn, word_id, stories)

            total += 1
            ex_count += len(examples)
            st_count += len(stories)

            if total % 500 == 0:
                print(f"已处理 {total} 条单词...")

        conn.commit()
        print("导入完成")
        print(f"单词总数: {total}")
        print(f"例句总数: {ex_count}")
        print(f"故事总数: {st_count}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()