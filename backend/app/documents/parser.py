import os
import hashlib
import csv
from typing import List, Dict, Any, Tuple

class ExtractedSection:
    def __init__(self, content: str, page_number: int = 1, section_path: str = "", metadata: Dict[str, Any] = None):
        self.content = content
        self.page_number = page_number
        self.section_path = section_path
        self.metadata = metadata or {}

class DocumentParser:
    @staticmethod
    def compute_sha256(file_path: str) -> str:
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            while chunk := f.read(8192):
                sha256.update(chunk)
        return sha256.hexdigest()

    @classmethod
    def parse_file(cls, file_path: str, file_name: str) -> Tuple[List[ExtractedSection], int, int]:
        """
        Parses document and returns (extracted_sections, page_count, character_count).
        Preserves page boundaries, headings, and tabular layout where possible.
        """
        ext = os.path.splitext(file_name)[1].lower()
        sections: List[ExtractedSection] = []
        page_count = 1
        
        if ext == ".pdf":
            sections, page_count = cls._parse_pdf(file_path)
        elif ext in [".docx", ".doc"]:
            sections, page_count = cls._parse_docx(file_path)
        elif ext in [".txt", ".md", ".markdown"]:
            sections, page_count = cls._parse_text(file_path, ext)
        elif ext in [".csv"]:
            sections, page_count = cls._parse_csv(file_path)
        elif ext in [".xlsx", ".xls"]:
            sections, page_count = cls._parse_xlsx(file_path)
        else:
            # Fallback plain text read
            sections, page_count = cls._parse_text(file_path, ext)

        total_chars = sum(len(s.content) for s in sections)
        return sections, page_count, total_chars

    @classmethod
    def _parse_pdf(cls, file_path: str) -> Tuple[List[ExtractedSection], int]:
        sections: List[ExtractedSection] = []
        try:
            import pypdf
            reader = pypdf.PdfReader(file_path)
            if reader.is_encrypted:
                try:
                    reader.decrypt("")
                except Exception:
                    pass

            num_pages = len(reader.pages)
            for idx, page in enumerate(reader.pages):
                try:
                    text = page.extract_text() or ""
                except Exception:
                    text = ""
                text = text.strip()
                if text:
                    sections.append(ExtractedSection(
                        content=text,
                        page_number=idx + 1,
                        section_path=f"Page {idx + 1}",
                        metadata={"page": idx + 1}
                    ))
            if not sections:
                # Scanned or image-only PDF warning
                sections.append(ExtractedSection(
                    content="[Warning: No extractable text detected in this PDF. It may be a scanned image or encrypted document requiring OCR.]",
                    page_number=1,
                    section_path="Warning"
                ))
            return sections, max(num_pages, 1)
        except Exception as e:
            return [ExtractedSection(content=f"Error reading PDF: {str(e)}", page_number=1)], 1

    @classmethod
    def _parse_docx(cls, file_path: str) -> Tuple[List[ExtractedSection], int]:
        sections: List[ExtractedSection] = []
        try:
            import docx
            doc = docx.Document(file_path)
            current_heading = "Document Content"
            current_text_blocks = []
            
            for para in doc.paragraphs:
                text = para.text.strip()
                if not text:
                    continue
                if para.style and para.style.name.startswith("Heading"):
                    if current_text_blocks:
                        sections.append(ExtractedSection(
                            content="\n\n".join(current_text_blocks),
                            page_number=1,
                            section_path=current_heading
                        ))
                        current_text_blocks = []
                    current_heading = text
                else:
                    current_text_blocks.append(text)
            
            if current_text_blocks:
                sections.append(ExtractedSection(
                    content="\n\n".join(current_text_blocks),
                    page_number=1,
                    section_path=current_heading
                ))
                
            # Parse docx tables
            for t_idx, table in enumerate(doc.tables):
                table_lines = []
                for row in table.rows:
                    cells = [c.text.strip().replace("\n", " ") for c in row.cells]
                    table_lines.append(" | ".join(cells))
                if table_lines:
                    sections.append(ExtractedSection(
                        content="\n".join(table_lines),
                        page_number=1,
                        section_path=f"Table {t_idx + 1}"
                    ))
                    
            if not sections:
                sections.append(ExtractedSection(content="[Empty DOCX document]", page_number=1))
            return sections, 1
        except Exception as e:
            return [ExtractedSection(content=f"Error reading DOCX: {str(e)}", page_number=1)], 1

    @classmethod
    def _parse_text(cls, file_path: str, ext: str) -> Tuple[List[ExtractedSection], int]:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

        sections: List[ExtractedSection] = []
        if ext in [".md", ".markdown"]:
            # Markdown header detection
            lines = content.split("\n")
            current_heading = "Top Section"
            buffer = []
            for line in lines:
                if line.startswith("#"):
                    if buffer:
                        sections.append(ExtractedSection(
                            content="\n".join(buffer).strip(),
                            page_number=1,
                            section_path=current_heading
                        ))
                        buffer = []
                    current_heading = line.strip("#").strip()
                buffer.append(line)
            if buffer:
                sections.append(ExtractedSection(
                    content="\n".join(buffer).strip(),
                    page_number=1,
                    section_path=current_heading
                ))
        else:
            sections.append(ExtractedSection(
                content=content.strip(),
                page_number=1,
                section_path="Main Content"
            ))
        return sections, 1

    @classmethod
    def _parse_csv(cls, file_path: str) -> Tuple[List[ExtractedSection], int]:
        sections: List[ExtractedSection] = []
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                reader = csv.reader(f)
                rows = list(reader)
                if not rows:
                    return [ExtractedSection(content="[Empty CSV]", page_number=1)], 1
                headers = rows[0]
                lines = [f"Columns: {', '.join(headers)}"]
                for idx, row in enumerate(rows[1:], start=1):
                    row_repr = ", ".join(f"{h}: {val}" for h, val in zip(headers, row) if val)
                    lines.append(f"Row {idx}: {row_repr}")
                    # Chunk every 50 rows into a section
                    if len(lines) >= 50:
                        sections.append(ExtractedSection(
                            content="\n".join(lines),
                            page_number=1,
                            section_path=f"Rows {idx-49} - {idx}"
                        ))
                        lines = [f"Columns: {', '.join(headers)}"]
                if len(lines) > 1:
                    sections.append(ExtractedSection(
                        content="\n".join(lines),
                        page_number=1,
                        section_path="Remaining Rows"
                    ))
            return sections, 1
        except Exception as e:
            return [ExtractedSection(content=f"Error reading CSV: {str(e)}", page_number=1)], 1

    @classmethod
    def _parse_xlsx(cls, file_path: str) -> Tuple[List[ExtractedSection], int]:
        sections: List[ExtractedSection] = []
        try:
            import openpyxl
            wb = openpyxl.load_workbook(file_path, data_only=True)
            for sheetname in wb.sheetnames:
                sheet = wb[sheetname]
                rows = list(sheet.iter_rows(values_only=True))
                if not rows:
                    continue
                headers = [str(c or "") for c in rows[0]]
                lines = [f"Sheet: {sheetname}", f"Columns: {', '.join(headers)}"]
                for idx, row in enumerate(rows[1:], start=1):
                    cells = [f"{headers[i]}: {str(c)}" for i, c in enumerate(row) if c is not None and i < len(headers)]
                    if cells:
                        lines.append(f"Row {idx}: {', '.join(cells)}")
                sections.append(ExtractedSection(
                    content="\n".join(lines),
                    page_number=1,
                    section_path=f"Worksheet: {sheetname}"
                ))
            return sections or [ExtractedSection(content="[Empty Workbook]", page_number=1)], len(wb.sheetnames)
        except Exception as e:
            return [ExtractedSection(content=f"Error reading Excel: {str(e)}", page_number=1)], 1
