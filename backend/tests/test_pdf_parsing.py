import io
import pytest
import pypdf
from backend.app.documents.parser import DocumentParser

def test_pypdf_cryptography_aes_support():
    # Verify cryptography is accessible by pypdf
    import cryptography
    assert hasattr(cryptography, "__version__")

    # Create a basic PDF in-memory to test reader parsing
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=72, height=72)
    # Encrypt with standard permissions
    writer.encrypt(user_password="", owner_password="owner_password_test")
    
    buf = io.BytesIO()
    writer.write(buf)
    buf.seek(0)

    # Read with PdfReader
    reader = pypdf.PdfReader(buf)
    assert reader.is_encrypted
    decrypted = reader.decrypt("")
    assert decrypted in (pypdf.PasswordType.USER_PASSWORD, pypdf.PasswordType.OWNER_PASSWORD, 1, 2)
    assert len(reader.pages) == 1
