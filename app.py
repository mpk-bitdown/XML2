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
import io
import csv

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
    # Tipo de documento (por ejemplo Factura electrónica, Nota de crédito)
    doc_type = db.Column(db.String(100), nullable=True)
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
            "doc_type": self.doc_type,
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
# User model for login and permissions
class User(db.Model):
    """Represents a system user for authentication."""

    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)  # Stored in plain text for simplicity
    is_admin = db.Column(db.Boolean, default=False)

    def as_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "email": self.email,
            "is_admin": self.is_admin,
        }


# ---------------------------------------------------------------------------
# Utility functions
def create_tables() -> None:
    """Create database tables at start up if they do not already exist.

    Additionally pre‑populate the superuser account.  Existing data are
    preserved to avoid wiping uploaded documents on restart.
    """
    with app.app_context():
        db.create_all()
        # Ensure superuser exists
        admin_email = os.environ.get("ADMIN_EMAIL", "mparada@edudown.cl")
        admin_pwd = os.environ.get("ADMIN_PASSWORD", "2Edudown")
        admin = User.query.filter_by(email=admin_email).first()
        if admin is None:
            admin = User(email=admin_email, password=admin_pwd, is_admin=True)
            db.session.add(admin)
            db.session.commit()


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


# Additional routes to serve login and user management pages
@app.route("/login")
def serve_login_page() -> Any:
    """Serve the login page."""
    return app.send_static_file("login.html")


@app.route("/users")
@app.route("/users.html")
def serve_users_page() -> Any:
    """Serve the admin users management page."""
    return app.send_static_file("users.html")


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
    types_param = request.args.get("type")
    query = Document.query
    # Supplier filtering
    if supplier_param:
        # Allow comma‑separated list of supplier ids or names
        supplier_values = [v.strip() for v in supplier_param.split(',') if v.strip()]
        # If all values are digits, treat as ids
        if supplier_values and all(v.isdigit() for v in supplier_values):
            ids = [int(v) for v in supplier_values]
            query = query.join(Supplier, Supplier.id == Document.supplier_id)
            query = query.filter(Supplier.id.in_(ids))
        else:
            query = query.join(Supplier, Supplier.id == Document.supplier_id)
            query = query.filter(Supplier.name.in_(supplier_values))
    # Document type filter (comma‑separated list)
    if types_param:
        types_list = [t.strip() for t in types_param.split(',') if t.strip()]
        if types_list:
            query = query.filter(Document.doc_type.in_(types_list))

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
                    # Determine document type from TipoDTE or TpoDoc fields
                    doc_type = None
                    # Try TipoDTE as defined by SII (e.g., 33=Factura, 34=Factura exenta, 61=Nota de crédito, 56=Nota de débito)
                    tipo_text = (
                        iddoc.findtext('sii:TipoDTE', default='', namespaces=ns)
                        or iddoc.findtext('sii:TpoDoc', default='', namespaces=ns)
                    )
                    tipo_map = {
                        '33': 'Factura electrónica',
                        '34': 'Factura exenta',
                        '61': 'Nota de crédito',
                        '56': 'Nota de débito',
                        '52': 'Guía de despacho',
                        '39': 'Boleta',
                        '41': 'Boleta exenta',
                    }
                    if tipo_text:
                        doc_type = tipo_map.get(tipo_text.strip(), tipo_text.strip())
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
                        doc_type=doc_type,
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
                    doc_type=None,
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
                doc_type='PDF',
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


@app.route("/api/products", methods=["GET"])
def list_products() -> tuple[Dict[str, Any], int]:
    """Return a list of unique product names extracted from items."""
    products = db.session.query(Item.name).distinct().all()
    product_list = [p[0] for p in products]
    return {"products": product_list}, 200


@app.route("/api/suppliers", methods=["GET"])
def list_suppliers() -> tuple[Dict[str, Any], int]:
    """Return a list of all suppliers with their id, rut and name."""
    suppliers = Supplier.query.order_by(Supplier.name).all()
    return {
        "suppliers": [
            {"id": s.id, "rut": s.rut, "name": s.name} for s in suppliers
        ]
    }, 200


@app.route("/api/analytics/products/chart", methods=["GET"])
def products_chart() -> tuple[Dict[str, Any], int]:
    """
    Return aggregated product quantities and values based on optional filters.

    Query parameters:
        start (str): Start month in format YYYY-MM. Inclusive.
        end (str): End month in format YYYY-MM. Inclusive.
        supplier (str|int): Supplier id or name to filter. If numeric, treated as id.

    Response:
        dict: { "products": {product_name: {"total_qty": float, "total_value": float}} }
    """
    start_param = request.args.get("start")
    end_param = request.args.get("end")
    supplier_param = request.args.get("supplier")
    query = db.session.query(
        Item.name.label("producto"),
        db.func.sum(Item.quantity).label("total_qty"),
        db.func.sum(Item.quantity * Item.price).label("total_value"),
    ).join(Document, Document.id == Item.document_id)
    # Date filters
    if start_param:
        try:
            start_date = datetime.strptime(start_param, "%Y-%m")
            query = query.filter(Document.doc_date != None)
            query = query.filter(Document.doc_date >= start_date.date())
        except Exception:
            pass
    if end_param:
        try:
            from calendar import monthrange
            end_date = datetime.strptime(end_param, "%Y-%m")
            year, month = end_date.year, end_date.month
            last_day = monthrange(year, month)[1]
            end_full_date = datetime(year, month, last_day).date()
            query = query.filter(Document.doc_date != None)
            query = query.filter(Document.doc_date <= end_full_date)
        except Exception:
            pass
    # Supplier filter
    if supplier_param:
        if supplier_param.isdigit():
            query = query.join(Supplier, Supplier.id == Document.supplier_id)
            query = query.filter(Supplier.id == int(supplier_param))
        else:
            query = query.join(Supplier, Supplier.id == Document.supplier_id)
            query = query.filter(Supplier.name == supplier_param)
    # Document type filter (comma‑separated)
    types_param = request.args.get("type")
    if types_param:
        types_list = [t.strip() for t in types_param.split(',') if t.strip()]
        if types_list:
            query = query.filter(Document.doc_type.in_(types_list))
    result_rows = query.group_by(Item.name).all()
    products_summary: Dict[str, Dict[str, float]] = {}
    for prod, total_qty, total_value in result_rows:
        products_summary[prod] = {
            "total_qty": float(total_qty or 0),
            "total_value": float(total_value or 0),
        }
    return {"products": products_summary}, 200


@app.route("/api/analytics/categories", methods=["GET"])
def categories_analytics() -> tuple[Dict[str, Any], int]:
    """
    Compute product categories and aggregate quantities and values per category.

    Optional query parameters:
        start (str): Start month in format YYYY-MM. Inclusive.
        end (str): End month in format YYYY-MM. Inclusive.
        supplier (str|int): Supplier id or name to filter.

    Categories are inferred from product names using simple heuristics. Returns a
    dictionary of categories with total quantity and total value, along with a
    mapping of each product name to its category.
    """
    start_param = request.args.get("start")
    end_param = request.args.get("end")
    supplier_param = request.args.get("supplier")
    types_param = request.args.get("type")
    query = db.session.query(
        Item.name.label("producto"),
        db.func.sum(Item.quantity).label("total_qty"),
        db.func.sum(Item.quantity * Item.price).label("total_value"),
    ).join(Document, Document.id == Item.document_id)
    # Date filters
    if start_param:
        try:
            start_date = datetime.strptime(start_param, "%Y-%m").date()
            query = query.filter(Document.doc_date != None)
            query = query.filter(Document.doc_date >= start_date)
        except Exception:
            pass
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
    # Supplier filter
    if supplier_param:
        if supplier_param.isdigit():
            query = query.join(Supplier, Supplier.id == Document.supplier_id)
            query = query.filter(Supplier.id == int(supplier_param))
        else:
            query = query.join(Supplier, Supplier.id == Document.supplier_id)
            query = query.filter(Supplier.name == supplier_param)
    rows = query.group_by(Item.name).all()
    # Apply document type filter after grouping if provided
    if types_param:
        types_list = [t.strip() for t in types_param.split(',') if t.strip()]
        if types_list:
            # Filter rows by doc_type by re-querying documents for each product; for efficiency we
            # instead build a set of allowed doc ids once and filter rows accordingly.
            allowed_doc_ids = {
                doc.id for doc in Document.query.filter(Document.doc_type.in_(types_list)).all()
            }
            # Filter out products whose documents are not in allowed list by checking any item of the product
            filtered = []
            for prod, total_qty, total_value in rows:
                # Determine if this product appears in any allowed document
                any_match = (
                    db.session.query(Item)
                    .join(Document, Document.id == Item.document_id)
                    .filter(Item.name == prod)
                    .filter(Document.id.in_(allowed_doc_ids))
                    .count() > 0
                )
                if any_match:
                    filtered.append((prod, total_qty, total_value))
            rows = filtered
    def classify(name: str) -> str:
        lower = name.lower()
        categories_keywords = [
            ("Carnes", ["carne", "pollo", "vacuno", "res", "cerdo", "cordero", "jamón", "tocino", "salchicha"]),
            ("Pescados y Mariscos", ["pescado", "marisco", "atún", "salmón", "camaron", "merluza", "ostión", "chorito"]),
            ("Lácteos", ["queso", "leche", "yogur", "mantequilla", "crema", "manjar", "helado"]),
            ("Frutas", ["manzana", "plátano", "banana", "pera", "uva", "fresa", "frutilla", "mora", "fruta", "kiwi", "naranja", "melón", "durazno", "sandía", "piña"]),
            ("Verduras", ["tomate", "cebolla", "lechuga", "zanahoria", "papa", "verdura", "champiñón", "brocoli", "pimiento", "col", "espinaca", "berenjena", "zapallo", "pepino", "ajo"]),
            ("Panadería y Pastelería", ["pan", "bolleria", "bollería", "croissant", "baguette", "empanada", "empanada de horno", "torta", "pastel", "gallet", "postre", "queque"]),
            ("Snacks y Dulces", ["snack", "galleta", "chocolate", "dulce", "caramelo", "barra", "papas fritas", "chips", "maní", "nueces", "almendra"]),
            ("Cereales y Granos", ["arroz", "frijol", "lenteja", "poroto", "garbanzo", "cereal", "avena"]),
            ("Pastas y Harinas", ["pasta", "fideo", "harina", "spaghetti", "macarrón", "macarrones"]),
            ("Aceites y Condimentos", ["aceite", "sal", "azúcar", "especia", "condimento", "salsa", "aderezo", "vinagre", "mayonesa", "ketchup", "mostaza"]),
            ("Bebidas Alcohólicas", ["vino", "cerveza", "pisco", "ron", "whisky", "vodka", "licor", "champaña"]),
            ("Bebidas no Alcohólicas", ["agua", "soda", "jugo", "refresco", "gaseosa", "cola", "coca", "pepsi", "té", "café"]),
            ("Aseo y Limpieza", ["jabón", "detergente", "cloro", "limpiador", "desinfectante", "escoba", "esponja", "lavaloza", "trapeador"]),
            ("Higiene Personal", ["shampoo", "champú", "crema dental", "cepillo", "desodorante", "pañal", "toalla higiénica", "afeitar", "jabón corporal"]),
            ("Mascotas", ["perro", "gato", "mascota", "alimento para perros", "alimento para gatos", "arena sanitaria", "hueso"]),
            ("Bebé", ["leche infantil", "pañal", "bebé", "mamadera", "toallita húmeda"]),
            ("Congelados", ["congelado", "helado", "hielo", "frozen", "sorbete"]),
            ("Electrónicos y Tecnología", ["cable", "usb", "teléfono", "celular", "computador", "laptop", "batería", "cargador", "audífono"]),
            ("Herramientas y Ferretería", ["clavo", "martillo", "serrucho", "tornillo", "destornillador", "llave", "taladro", "alicate"]),
            ("Oficina y Papelería", ["cuaderno", "lápiz", "papel", "bolígrafo", "carpeta", "notebook", "impresora", "tinta"]),
            ("Otros", []),
        ]
        for category, keywords in categories_keywords[:-1]:
            for kw in keywords:
                if kw in lower:
                    return category
        return "Otros"
    categories_summary: Dict[str, Dict[str, float]] = {}
    product_categories: Dict[str, str] = {}
    for prod, total_qty, total_value in rows:
        category = classify(prod)
        product_categories[prod] = category
        if category not in categories_summary:
            categories_summary[category] = {"total_qty": 0.0, "total_value": 0.0}
        categories_summary[category]["total_qty"] += float(total_qty or 0)
        categories_summary[category]["total_value"] += float(total_value or 0)
    return {"categories": categories_summary, "products": product_categories}, 200


@app.route("/api/analytics/categories/export", methods=["GET"])
def export_categories_excel() -> Any:
    """
    Export categories summary to Excel.

    Each row contains:
        - Categoría
        - Cantidad total
        - Valor total

    Returns:
        An Excel file for download.
    """
    data, _ = categories_analytics()
    categories_summary = data.get("categories", {})
    records = []
    for cat, stats in categories_summary.items():
        records.append({
            "Categoría": cat,
            "Cantidad total": float(stats.get("total_qty", 0)),
            "Valor total": float(stats.get("total_value", 0)),
        })
    df = pd.DataFrame(records)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Categorias")
    output.seek(0)
    return (
        output.getvalue(),
        200,
        {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": "attachment; filename=categorias.xlsx",
        },
    )


@app.route("/api/documents/types", methods=["GET"])
def list_document_types() -> tuple[Dict[str, Any], int]:
    """Return a list of unique document types present in the database."""
    types = db.session.query(Document.doc_type).filter(Document.doc_type != None).distinct().all()
    type_list = [t[0] for t in types]
    return {"types": type_list}, 200


@app.route("/api/analytics", methods=["GET"])
def analytics() -> tuple[Dict[str, Any], int]:
    """
    Compute and return aggregated analytics for suppliers, products and monthly quantities.

    Query parameters:
        product (optional): name of a product to get detailed monthly quantity and price stats.
    """
    product_name = request.args.get("product")
    result: Dict[str, Any] = {}
    # Providers usage: count documents per supplier
    provider_counts = (
        db.session.query(Supplier.name, db.func.count(Document.id))
        .join(Document, Supplier.id == Document.supplier_id)
        .group_by(Supplier.id)
        .all()
    )
    result["providers_usage"] = {name: count for name, count in provider_counts}
    # Products summary: total quantity and price stats per product
    product_stats = (
        db.session.query(
            Item.name,
            db.func.count(Item.id).label("count_items"),
            db.func.sum(Item.quantity).label("total_qty"),
            db.func.min(Item.price).label("min_price"),
            db.func.max(Item.price).label("max_price"),
            db.func.avg(Item.price).label("avg_price"),
        )
        .group_by(Item.name)
        .all()
    )
    result["products_summary"] = {
        name: {
            "count_items": count,
            "total_qty": float(total_qty or 0),
            "min_price": float(min_price or 0),
            "max_price": float(max_price or 0),
            "avg_price": float(avg_price or 0),
        }
        for name, count, total_qty, min_price, max_price, avg_price in product_stats
    }
    # Monthly quantities across all products
    monthly_quantities = (
        db.session.query(
            db.func.strftime('%Y-%m', Document.doc_date).label("month"),
            db.func.sum(Item.quantity).label("total_qty"),
        )
        .join(Item, Document.id == Item.document_id)
        .filter(Document.doc_date != None)
        .group_by("month")
        .order_by("month")
        .all()
    )
    result["monthly_quantities"] = {month: float(total_qty or 0) for month, total_qty in monthly_quantities}
    # If product specified, compute monthly quantity and price stats for it
    if product_name:
        product_monthly = (
            db.session.query(
                db.func.strftime('%Y-%m', Document.doc_date).label("month"),
                db.func.sum(Item.quantity).label("total_qty"),
                db.func.min(Item.price).label("min_price"),
                db.func.max(Item.price).label("max_price"),
                db.func.avg(Item.price).label("avg_price"),
            )
            .join(Item, Document.id == Item.document_id)
            .filter(Item.name == product_name)
            .filter(Document.doc_date != None)
            .group_by("month")
            .order_by("month")
            .all()
        )
        result["product_monthly"] = {
            month: {
                "total_qty": float(total_qty or 0),
                "min_price": float(min_price or 0),
                "max_price": float(max_price or 0),
                "avg_price": float(avg_price or 0),
            }
            for month, total_qty, min_price, max_price, avg_price in product_monthly
        }
    return result, 200


@app.route("/api/dashboard", methods=["GET"])
def dashboard_data() -> tuple[Dict[str, Any], int]:
    """Return aggregated statistics for dashboard visualizations."""
    docs = Document.query.all()
    stats: Dict[str, Any] = {
        "count_per_type": {},
        "total_size_per_type": {},
        "avg_pages": None,
        "file_sizes": [],
    }
    total_pages = 0
    pdf_count = 0
    for doc in docs:
        stats["count_per_type"].setdefault(doc.filetype, 0)
        stats["count_per_type"][doc.filetype] += 1
        stats["total_size_per_type"].setdefault(doc.filetype, 0)
        stats["total_size_per_type"][doc.filetype] += doc.size_bytes
        stats["file_sizes"].append(doc.size_bytes)
        if doc.filetype == "pdf" and doc.pages is not None:
            pdf_count += 1
            total_pages += doc.pages
    if pdf_count:
        stats["avg_pages"] = total_pages / pdf_count
    return stats, 200


@app.route("/api/documents/csv", methods=["POST"])
def export_documents_csv() -> Any:
    """Return a CSV file containing selected documents metadata."""
    data = request.get_json(silent=True) or {}
    ids = data.get("ids")
    query = Document.query
    if ids:
        query = query.filter(Document.id.in_(ids))
    else:
        supplier_param = request.args.get("supplier")
        start_param = request.args.get("start")
        end_param = request.args.get("end")
        if supplier_param:
            if supplier_param.isdigit():
                query = query.join(Supplier, Supplier.id == Document.supplier_id)
                query = query.filter(Supplier.id == int(supplier_param))
            else:
                query = query.join(Supplier, Supplier.id == Document.supplier_id)
                query = query.filter(Supplier.name == supplier_param)
        if start_param:
            try:
                start_dt = datetime.strptime(start_param, "%Y-%m").date()
                query = query.filter(Document.doc_date != None)
                query = query.filter(Document.doc_date >= start_dt)
            except Exception:
                pass
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
    docs = query.all()
    from io import StringIO
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id",
        "filename",
        "filetype",
        "pages",
        "xml_root",
        "size_bytes",
        "upload_date",
        "supplier_name",
        "supplier_rut",
        "doc_date",
        "invoice_total",
    ])
    for doc in docs:
        invoice_total = 0.0
        for itm in doc.items:
            if itm.total is not None:
                invoice_total += float(itm.total)
            elif itm.quantity is not None and itm.price is not None:
                invoice_total += float(itm.quantity) * float(itm.price)
        writer.writerow([
            doc.id,
            doc.filename,
            doc.filetype,
            doc.pages or "",
            doc.xml_root or "",
            doc.size_bytes,
            doc.upload_date.isoformat(),
            doc.supplier.name if doc.supplier else "",
            doc.supplier.rut if doc.supplier else "",
            doc.doc_date.isoformat() if doc.doc_date else "",
            invoice_total,
        ])
    csv_content = output.getvalue()
    output.close()
    return (
        csv_content,
        200,
        {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": "attachment; filename=documents.csv",
        },
    )


# ---------------------------------------------------------------------------
# Authentication and user management

@app.route("/api/login", methods=["POST"])
def login() -> Any:
    """
    Authenticate a user with email and password.

    Expects JSON body {"email": str, "password": str}.  Returns JSON
    indicating success and whether the user is an admin.  If the
    credentials are invalid, returns HTTP 401.
    """
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    password = (data.get("password") or "").strip()
    user = User.query.filter_by(email=email).first()
    if user and user.password == password:
        return {"success": True, "is_admin": bool(user.is_admin)}, 200
    return {"error": "Credenciales inválidas"}, 401


@app.route("/api/users", methods=["GET", "POST", "DELETE"])
def manage_users() -> Any:
    """
    Admin‑only endpoint to manage users.

    Clients must include the current user's email in the ``X-User-Email``
    header.  Only the superuser (is_admin=True) can list, create or delete
    users.

    * GET: returns a list of users (without passwords).
    * POST: create a new user.  JSON body must include ``email`` and
      ``password``.  Optional ``is_admin`` boolean.
    * DELETE: remove a user by id specified in JSON body.  Cannot delete
      the superuser.
    """
    current_email = request.headers.get("X-User-Email")
    current_user = User.query.filter_by(email=current_email).first()
    if not current_user or not current_user.is_admin:
        return {"error": "No autorizado"}, 403
    if request.method == "GET":
        users = User.query.all()
        return {"users": [u.as_dict() for u in users]}, 200
    data = request.get_json(silent=True) or {}
    if request.method == "POST":
        email = (data.get("email") or "").strip()
        password = (data.get("password") or "").strip()
        is_admin_flag = bool(data.get("is_admin", False))
        if not email or not password:
            return {"error": "Email y contraseña son obligatorios"}, 400
        if User.query.filter_by(email=email).first():
            return {"error": "El usuario ya existe"}, 400
        new_user = User(email=email, password=password, is_admin=is_admin_flag)
        db.session.add(new_user)
        db.session.commit()
        return new_user.as_dict(), 201
    # DELETE: allow deleting by id or email
    # Accept either "id" (int) or "email" (str) in body
    user_id = data.get("id")
    email_param = (data.get("email") or "").strip()
    if not user_id and not email_param:
        return {"error": "ID o email requerido"}, 400
    user: User | None = None
    if user_id:
        try:
            user = User.query.get(int(user_id))
        except Exception:
            user = None
    if not user and email_param:
        user = User.query.filter_by(email=email_param).first()
    if not user:
        return {"error": "Usuario no encontrado"}, 404
    # Prevent deletion of superuser
    admin_email = os.environ.get("ADMIN_EMAIL", "mparada@edudown.cl")
    if user.email == admin_email:
        return {"error": "No se puede eliminar el usuario administrador"}, 400
    db.session.delete(user)
    db.session.commit()
    return {"message": "Usuario eliminado"}, 200


@app.route("/api/documents/purge_duplicates", methods=["DELETE"])
def purge_duplicates() -> Any:
    """
    Remove duplicate XML documents based on invoice number, supplier and items.

    Keeps the earliest document (by id) in each duplicate group and deletes
    subsequent ones, along with their files and related database records.
    Returns the number of removed documents.
    """
    # Build groups by key: (invoice_number, supplier_id, doc_date, tuple of item details)
    docs = Document.query.filter(Document.filetype == 'xml').all()
    groups: Dict[tuple, list[Document]] = {}
    for doc in docs:
        items_key = tuple(sorted([(it.name, it.quantity, it.price) for it in doc.items]))
        key = (doc.invoice_number, doc.supplier_id, doc.doc_date, items_key)
        groups.setdefault(key, []).append(doc)
    removed = 0
    for key, dlist in groups.items():
        if len(dlist) > 1:
            # Keep the earliest id
            sorted_docs = sorted(dlist, key=lambda d: d.id)
            for dup in sorted_docs[1:]:
                # Remove file from uploads
                try:
                    os.remove(os.path.join(app.config["UPLOAD_FOLDER"], dup.filename))
                except FileNotFoundError:
                    pass
                # Delete record cascades items
                db.session.delete(dup)
                removed += 1
    db.session.commit()
    return {"removed": removed, "message": f"Se eliminaron {removed} duplicados"}, 200

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