"""
Combined Flask application for serving both the back‑end API and front‑end assets.

This application exposes a RESTful API under the ``/api`` prefix and also
serves a single‑page web interface from the ``static`` directory.  The
front‑end files live in ``static/`` and reference assets relative to
``/static``.  Running this module will create the necessary SQLite
database, if not present, and start a web server listening on the port
provided by the ``PORT`` environment variable (default ``5000``).  The
application is configured for deployment on Railway or any other
platform where the front‑end and back‑end are hosted from the same
domain.
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Dict
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from sqlalchemy.exc import IntegrityError
from werkzeug.utils import secure_filename
from xml.etree import ElementTree
from PyPDF2 import PdfReader
from fpdf import FPDF
import pandas as pd

# ---------------------------------------------------------------------------
# Flask configuration
#
# We specify ``static_folder`` and ``static_url_path`` so that Flask knows
# where to look for the compiled front‑end assets.  ``static_url_path`` is
# ``/static`` by default, but we set it explicitly for clarity.  The
# ``templates`` folder is unused because the index page is served from
# ``static/index.html``.
app = Flask(__name__, static_folder="static", static_url_path="/static")

# Directory to store uploaded documents.  This lives next to this file so
# uploads are kept outside the code and assets.
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Database configuration.  Use a relative SQLite file named ``documents.db``.
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///documents.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

db = SQLAlchemy(app)

# Enable CORS for API routes.  Although the front‑end is served from the
# same domain, enabling CORS makes local development (e.g. using a
# separate dev server) easier.  ``send_wildcard=True`` instructs
# Flask‑CORS to always send ``*`` in ``Access‑Control‑Allow‑Origin``.
CORS(app, resources={r"/api/*": {"origins": "*"}}, send_wildcard=True)


# ---------------------------------------------------------------------------
# Models
class Supplier(db.Model):
    """Represents a supplier (emisor) extracted from documents."""

    __tablename__ = "suppliers"
    id = db.Column(db.Integer, primary_key=True)
    rut = db.Column(db.String(20), unique=True, nullable=False)
    name = db.Column(db.String(255), nullable=False)
    documents = db.relationship("Document", back_populates="supplier")

    def as_dict(self) -> Dict[str, Any]:
        return {"id": self.id, "rut": self.rut, "name": self.name}


class Document(db.Model):
    """Represents an uploaded document (PDF or XML) or DTE envelope."""

    __tablename__ = "documents"

    id: int = db.Column(db.Integer, primary_key=True)
    filename: str = db.Column(db.String(255), nullable=False)
    filetype: str = db.Column(db.String(10), nullable=False)
    pages: int | None = db.Column(db.Integer, nullable=True)
    xml_root: str | None = db.Column(db.String(120), nullable=True)
    size_bytes: int = db.Column(db.Integer, nullable=False)
    upload_date: datetime = db.Column(db.DateTime, default=datetime.utcnow)
    invoice_number: str | None = db.Column(db.String(50), nullable=True)
    invoice_address: str | None = db.Column(db.String(255), nullable=True)
    supplier_id = db.Column(db.Integer, db.ForeignKey("suppliers.id"), nullable=True)
    doc_date = db.Column(db.Date, nullable=True)  # Date of the document (e.g., FchEmis)
    supplier = db.relationship("Supplier", back_populates="documents")
    items = db.relationship("Item", back_populates="document", cascade="all, delete-orphan")

    def as_dict(self) -> Dict[str, Any]:
        """
        Convert document instance into a serializable dict including supplier and invoice details.

        Returns:
            dict: metadata for the document, including supplier name, RUT and total invoice value.
        """
        data: Dict[str, Any] = {
            "id": self.id,
            "filename": self.filename,
            "filetype": self.filetype,
            "pages": self.pages,
            "xml_root": self.xml_root,
            "size_bytes": self.size_bytes,
            "upload_date": self.upload_date.isoformat(),
            "doc_date": self.doc_date.isoformat() if self.doc_date else None,
            "invoice_number": self.invoice_number,
            "invoice_address": self.invoice_address,
        }
        if self.supplier:
            data["supplier_rut"] = self.supplier.rut
            data["supplier_name"] = self.supplier.name
        total_value = 0.0
        for itm in self.items:
            if itm.total is not None:
                total_value += float(itm.total)
            elif itm.quantity is not None and itm.price is not None:
                total_value += float(itm.quantity) * float(itm.price)
        data["invoice_total"] = total_value
        return data


class Item(db.Model):
    """Represents an item (product) extracted from a document."""

    __tablename__ = "items"
    id = db.Column(db.Integer, primary_key=True)
    document_id = db.Column(db.Integer, db.ForeignKey("documents.id"), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    quantity = db.Column(db.Float, nullable=True)
    price = db.Column(db.Float, nullable=True)  # unit price
    total = db.Column(db.Float, nullable=True)  # total price for the line
    document = db.relationship("Document", back_populates="items")

    def as_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "document_id": self.document_id,
            "name": self.name,
            "quantity": self.quantity,
            "price": self.price,
            "total": self.total,
        }


# ---------------------------------------------------------------------------
# Utility functions
def create_tables() -> None:
    """Create database tables at start up.  Drops any existing tables first."""
    with app.app_context():
        db.drop_all()
        db.create_all()


def extract_document_metadata(filepath: str, filetype: str) -> Dict[str, Any]:
    """Extract metadata from a document based on its type.

    For PDFs, returns the number of pages.  For XMLs, returns the root tag.
    """
    metadata: Dict[str, Any] = {"pages": None, "xml_root": None}
    if filetype.lower() == "pdf":
        try:
            reader = PdfReader(filepath)
            metadata["pages"] = len(reader.pages)
        except Exception:
            metadata["pages"] = None
    elif filetype.lower() == "xml":
        try:
            tree = ElementTree.parse(filepath)
            metadata["xml_root"] = tree.getroot().tag
        except Exception:
            metadata["xml_root"] = None
    return metadata


# ---------------------------------------------------------------------------
# Routes

@app.route("/")
def serve_frontend() -> Any:
    """Serve the single‑page application from the static directory."""
    # The index.html lives in the static folder.  send_static_file will take
    # care of adding the correct Content‑Type header.
    return app.send_static_file("index.html")


@app.route("/api/documents", methods=["GET"])
def list_documents() -> tuple[Dict[str, Any], int]:
    """
    Return a list of uploaded documents along with their metadata.

    Optional query parameters allow filtering the returned documents by
    supplier and/or by a date range.

    Query parameters:
        supplier (str|int): Supplier id or name to filter. If numeric, treated as id.
        start (str): Start month in YYYY-MM format. Documents with a doc_date on or
            after the first day of the month are included.
        end (str): End month in YYYY-MM format. Documents with a doc_date on or
            before the last day of the month are included.
        invoice (str): Partial invoice number to filter by.

    Returns:
        dict: {"documents": [doc.as_dict(), ...]}
    """
    supplier_param = request.args.get("supplier")
    invoice_param = request.args.get("invoice")
    start_param = request.args.get("start")
    end_param = request.args.get("end")
    query = Document.query
    # Supplier filtering
    if supplier_param:
        if supplier_param.isdigit():
            query = query.join(Supplier, Supplier.id == Document.supplier_id)
            query = query.filter(Supplier.id == int(supplier_param))
        else:
            query = query.join(Supplier, Supplier.id == Document.supplier_id)
            query = query.filter(Supplier.name == supplier_param)
    # Start date filter
    if start_param:
        try:
            start_dt = datetime.strptime(start_param, "%Y-%m").date()
            query = query.filter(Document.doc_date != None)
            query = query.filter(Document.doc_date >= start_dt)
        except Exception:
            pass
    # Invoice number filter (partial)
    if invoice_param:
        query = query.filter(Document.invoice_number != None)
        like_pattern = f"%{invoice_param}%"
        query = query.filter(Document.invoice_number.ilike(like_pattern))
    # End date filter
    if end_param:
        try:
            from calendar import monthrange
            end_dt = datetime.strptime(end_param, "%Y-%m")
            year, month = end_dt.year, end_dt.month
            last_day = monthrange(year, month)[1]
            end_date = datetime(year, month, last_day).date()
            query = query.filter(Document.doc_date != None)
            query = query.filter(Document.doc_date <= end_date)
        except Exception:
            pass
    docs = query.order_by(Document.upload_date.desc()).all()
    return {"documents": [doc.as_dict() for doc in docs]}, 200


@app.route("/api/documents", methods=["POST"])
def upload_document() -> tuple[Dict[str, Any], int]:
    """
    Handle uploading of one or multiple documents.

    Supports multipart/form-data with either a single file field named 'file' or
    multiple files under 'files'. Only PDF and XML files are accepted.
    Returns a list of created documents.
    """
    files = []
    if 'files' in request.files:
        files = request.files.getlist('files')
    elif 'file' in request.files:
        files = [request.files['file']]
    else:
        return {"error": "No file(s) part in the request."}, 400
    created_docs: list[Document] = []
    for upload in files:
        if upload.filename == '':
            continue
        filename = secure_filename(upload.filename)
        ext = os.path.splitext(filename)[1].lower().lstrip('.')
        if ext not in {"pdf", "xml"}:
            continue
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if os.path.exists(filepath):
            base, extension = os.path.splitext(filename)
            filename = f"{base}_{int(datetime.utcnow().timestamp())}{extension}"
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        upload.save(filepath)
        size = os.path.getsize(filepath)
        meta = extract_document_metadata(filepath, ext)
        if ext == "xml":
            try:
                import xml.etree.ElementTree as ET
                ns = {'sii': 'http://www.sii.cl/SiiDte'}
                tree = ET.parse(filepath)
                root_xml = tree.getroot()
                xml_root_tag = root_xml.tag.split('}')[-1] if '}' in root_xml.tag else root_xml.tag
                for dte in root_xml.findall('.//sii:DTE', ns):
                    emisor = dte.find('.//sii:Emisor', ns)
                    rut_emisor = None
                    nombre_emisor = None
                    if emisor is not None:
                        rut_emisor = emisor.findtext('sii:RUTEmisor', default='', namespaces=ns)
                        nombre_emisor = (
                            emisor.findtext('sii:RznSoc', default='', namespaces=ns)
                            or emisor.findtext('sii:RznSocEmisor', default='', namespaces=ns)
                        )
                    supplier = None
                    if rut_emisor:
                        supplier = Supplier.query.filter_by(rut=rut_emisor).first()
                        if supplier is None:
                            supplier = Supplier(rut=rut_emisor, name=nombre_emisor or rut_emisor)
                            db.session.add(supplier)
                    iddoc = dte.find('.//sii:IdDoc', ns)
                    doc_date = None
                    invoice_number = None
                    if iddoc is not None:
                        date_text = iddoc.findtext('sii:FchEmis', default='', namespaces=ns)
                        if date_text:
                            try:
                                doc_date = datetime.strptime(date_text, '%Y-%m-%d').date()
                            except Exception:
                                doc_date = None
                        folio_text = iddoc.findtext('sii:Folio', default='', namespaces=ns)
                        invoice_number = folio_text.strip() if folio_text else None
                        if invoice_number == '':
                            invoice_number = None
                    invoice_address = None
                    receptor = dte.find('.//sii:Receptor', ns)
                    if receptor is not None:
                        addr = receptor.findtext('sii:DirRecep', default='', namespaces=ns)
                        if not addr:
                            addr = receptor.findtext('sii:DirDest', default='', namespaces=ns)
                        invoice_address = addr.strip() if addr else None
                    doc = Document(
                        filename=filename,
                        filetype=ext,
                        pages=None,
                        xml_root=xml_root_tag,
                        size_bytes=size,
                        supplier=supplier,
                        doc_date=doc_date,
                        invoice_number=invoice_number,
                        invoice_address=invoice_address,
                    )
                    db.session.add(doc)
                    created_docs.append(doc)
                    for det in dte.findall('.//sii:Detalle', ns):
                        name_item = det.findtext('sii:NmbItem', default='', namespaces=ns)
                        qty_text = det.findtext('sii:QtyItem', default='', namespaces=ns)
                        price_text = det.findtext('sii:PrcItem', default='', namespaces=ns)
                        total_text = det.findtext('sii:MontoItem', default='', namespaces=ns)
                        try:
                            quantity = float(qty_text) if qty_text else None
                        except Exception:
                            quantity = None
                        try:
                            price = float(price_text) if price_text else None
                        except Exception:
                            price = None
                        try:
                            total_val = float(total_text) if total_text else None
                        except Exception:
                            total_val = None
                        item = Item(
                            document=doc,
                            name=name_item,
                            quantity=quantity,
                            price=price,
                            total=total_val,
                        )
                        db.session.add(item)
            except Exception:
                doc = Document(
                    filename=filename,
                    filetype=ext,
                    pages=None,
                    xml_root=meta.get("xml_root"),
                    size_bytes=size,
                )
                db.session.add(doc)
                created_docs.append(doc)
        else:
            doc = Document(
                filename=filename,
                filetype=ext,
                pages=meta.get("pages"),
                xml_root=meta.get("xml_root"),
                size_bytes=size,
            )
            db.session.add(doc)
            created_docs.append(doc)
    db.session.commit()
    if not created_docs:
        return {"error": "No valid files were uploaded."}, 400
    if len(created_docs) == 1:
        return created_docs[0].as_dict(), 201
    return {"documents": [d.as_dict() for d in created_docs]}, 201


@app.route("/api/documents/<int:doc_id>", methods=["GET"])
def get_document(doc_id: int) -> tuple[Dict[str, Any], int]:
    """Retrieve metadata of a single document."""
    doc = Document.query.get(doc_id)
    if doc is None:
        return {"error": f"Documento con id {doc_id} no encontrado."}, 404
    return doc.as_dict(), 200


@app.route("/api/documents/<int:doc_id>/download", methods=["GET"])
def download_document(doc_id: int) -> Any:
    """
    Generate a simple PDF summary of the document containing supplier details,
    items with quantities, unit prices and subtotals, and invoice totals.
    """
    doc = Document.query.get(doc_id)
    if doc is None:
        return {"error": f"Documento con id {doc_id} no encontrado."}, 404
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Arial", style="B", size=16)
    pdf.cell(0, 10, "Resumen de Factura", ln=True)
    pdf.ln(5)
    pdf.set_font("Arial", style="B", size=12)
    pdf.cell(40, 8, "Proveedor:")
    pdf.set_font("Arial", size=12)
    pdf.cell(0, 8, doc.supplier.name if doc.supplier else "-", ln=True)
    pdf.set_font("Arial", style="B", size=12)
    pdf.cell(40, 8, "RUT:")
    pdf.set_font("Arial", size=12)
    pdf.cell(0, 8, doc.supplier.rut if doc.supplier else "-", ln=True)
    pdf.set_font("Arial", style="B", size=12)
    pdf.cell(40, 8, "Fecha factura:")
    pdf.set_font("Arial", size=12)
    if doc.doc_date:
        pdf.cell(0, 8, doc.doc_date.strftime("%d/%m/%Y"), ln=True)
    else:
        pdf.cell(0, 8, "-", ln=True)
    pdf.ln(5)
    pdf.set_font("Arial", style="B", size=11)
    pdf.cell(80, 8, "Producto", border=1)
    pdf.cell(30, 8, "Cantidad", border=1, align="R")
    pdf.cell(30, 8, "Precio", border=1, align="R")
    pdf.cell(40, 8, "Subtotal", border=1, align="R")
    pdf.ln()
    pdf.set_font("Arial", size=10)
    total_neto = 0.0
    for item in doc.items:
        qty = item.quantity or 0
        price = item.price or 0
        subtotal = item.total if item.total is not None else qty * price
        total_neto += subtotal or 0
        pdf.cell(80, 7, str(item.name), border=1)
        pdf.cell(30, 7, f"{qty:.2f}" if qty else "-", border=1, align="R")
        pdf.cell(30, 7, f"{price:,.0f}" if price else "-", border=1, align="R")
        pdf.cell(40, 7, f"{subtotal:,.0f}" if subtotal else "-", border=1, align="R")
        pdf.ln()
    pdf.ln(3)
    pdf.set_font("Arial", style="B", size=12)
    pdf.cell(80, 8, "Total neto:")
    pdf.set_font("Arial", size=12)
    pdf.cell(40, 8, f"{total_neto:,.0f}", align="R")
    pdf.ln()
    invoice_total = doc.as_dict().get("invoice_total", 0)
    pdf.set_font("Arial", style="B", size=12)
    pdf.cell(80, 8, "Total factura:")
    pdf.set_font("Arial", size=12)
    pdf.cell(40, 8, f"{invoice_total:,.0f}", align="R")
    pdf_data = pdf.output(dest="S")
    if isinstance(pdf_data, (bytes, bytearray)):
        pdf_bytes = bytes(pdf_data)
    else:
        pdf_bytes = pdf_data.encode("latin1")
    filename = f"factura_resumen_{doc.id}.pdf"
    return Response(pdf_bytes, headers={
        "Content-Type": "application/pdf",
        "Content-Disposition": f"attachment; filename={filename}"
    })


@app.route("/api/documents/delete_all", methods=["DELETE"])
def delete_all_documents() -> Any:
    """Delete all documents, suppliers and items from the database and uploads folder."""
    docs = Document.query.all()
    for doc in docs:
        try:
            os.remove(os.path.join(app.config["UPLOAD_FOLDER"], doc.filename))
        except FileNotFoundError:
            pass
    db.session.query(Item).delete()
    db.session.query(Document).delete()
    db.session.query(Supplier).delete()
    db.session.commit()
    return {"message": "Todos los documentos han sido eliminados"}, 200


@app.route("/api/analytics/products/export", methods=["GET"])
def export_products_excel() -> Any:
    """
    Export a summary of products in Excel format.

    Each row represents a single product. Columns include:
        - Producto: name of the product
        - Meses: concatenated list of months in which the product was purchased, in MMYYYY format
        - Proveedores: list of supplier names involved, separated by semicolons
        - RUT proveedores: list of supplier RUTs, separated by semicolons
        - Cantidad total: total quantity purchased across all months and suppliers
        - Precio mínimo: minimum unit price across all items
        - Precio máximo: maximum unit price across all items
        - Precio promedio: average unit price across all items

    Returns:
        A streaming response with the Excel file for download.
    """
    rows = (
        db.session.query(
            Item.name.label("producto"),
            db.func.strftime('%m%Y', Document.doc_date).label("mes"),
            Supplier.name.label("proveedor"),
            Supplier.rut.label("rut_proveedor"),
            Item.quantity.label("cantidad"),
            Item.price.label("precio"),
            Document.invoice_number.label("invoice_number"),
            Document.invoice_address.label("invoice_address"),
        )
        .join(Document, Document.id == Item.document_id)
        .join(Supplier, Supplier.id == Document.supplier_id)
        .filter(Document.doc_date != None)
        .all()
    )
    summary: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        prod = r.producto
        if prod not in summary:
            summary[prod] = {
                "meses": set(),
                "proveedores": set(),
                "rut_proveedores": set(),
                "facturas": set(),
                "direcciones": set(),
                "cantidades": [],
                "precios": [],
                "valores": [],
            }
        summary[prod]["meses"].add(r.mes)
        summary[prod]["proveedores"].add(r.proveedor)
        summary[prod]["rut_proveedores"].add(r.rut_proveedor)
        if r.invoice_number:
            summary[prod]["facturas"].add(str(r.invoice_number))
        if r.invoice_address:
            summary[prod]["direcciones"].add(str(r.invoice_address))
        if r.cantidad is not None:
            summary[prod]["cantidades"].append(float(r.cantidad))
        if r.precio is not None:
            summary[prod]["precios"].append(float(r.precio))
            if r.cantidad is not None:
                summary[prod]["valores"].append(float(r.cantidad) * float(r.precio))
    # Build a DataFrame
    rows_out = []
    for prod, data in summary.items():
        meses = "-".join(sorted(data["meses"])) if data["meses"] else ""
        proveedores = ";".join(sorted(data["proveedores"])) if data["proveedores"] else ""
        rut_proveedores = ";".join(sorted(data["rut_proveedores"])) if data["rut_proveedores"] else ""
        cantidad_total = sum(data["cantidades"]) if data["cantidades"] else 0
        precios = data["precios"] if data["precios"] else []
        precio_min = min(precios) if precios else 0
        precio_max = max(precios) if precios else 0
        precio_prom = sum(precios) / len(precios) if precios else 0
        rows_out.append({
            "Producto": prod,
            "Meses": meses,
            "Proveedores": proveedores,
            "RUT proveedores": rut_proveedores,
            "Cantidad total": cantidad_total,
            "Precio mínimo": precio_min,
            "Precio máximo": precio_max,
            "Precio promedio": precio_prom,
        })
    df = pd.DataFrame(rows_out)
    from io import BytesIO
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Productos")
    output.seek(0)
    filename = "resumen_productos.xlsx"
    return Response(
        output.read(),
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
    )


@app.route("/api/analytics/ai", methods=["GET"])
def get_ai_insights() -> Any:
    """
    Placeholder endpoint for AI insights.  Returns empty suggestions and
    projections.  In a real deployment this could call an external service.
    """
    return {"suggestions": [], "projections": {}}, 200


# ---------------------------------------------------------------------------
# Application entry point
if __name__ == "__main__":
    # Ensure the database schema exists.  In a production setting you
    # should use a migration tool instead of dropping tables on each run.
    create_tables()
    port = int(os.environ.get("PORT", 5000))
    # Bind to all interfaces so Railway can route traffic
    app.run(host="0.0.0.0", port=port)