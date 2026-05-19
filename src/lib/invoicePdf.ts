import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface InvoiceData {
  invoiceNumber: string;
  issueDate: string | Date;
  dueDate: string | Date | null;
  status: string;
  subtotal: string | number;
  taxAmount: string | number;
  totalAmount: string | number;
  paidAmount: string | number;
  notes?: string | null;
  customer?: {
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  } | null;
  items?: Array<{
    description: string;
    quantity: number;
    unitPrice: string | number;
    totalPrice: string | number;
  }>;
}

export function generateInvoicePDF(data: InvoiceData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  // Header
  doc.setFontSize(20);
  doc.setTextColor(99, 102, 241);
  doc.text("INVOICE", margin, 20);

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Invoice #: ${data.invoiceNumber}`, pageWidth - margin, 16, { align: "right" });
  doc.text(`Issue Date: ${formatDate(data.issueDate)}`, pageWidth - margin, 21, { align: "right" });
  if (data.dueDate) {
    doc.text(`Due Date: ${formatDate(data.dueDate)}`, pageWidth - margin, 26, { align: "right" });
  }
  doc.text(`Status: ${data.status.toUpperCase()}`, pageWidth - margin, 31, { align: "right" });

  // Bill To
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text("Bill To:", margin, 38);
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  const customer = data.customer;
  if (customer) {
    const name = `${customer.firstName || ""} ${customer.lastName || ""}`.trim();
    doc.text(name || "Customer", margin, 44);
    if (customer.company) doc.text(customer.company, margin, 49);
    if (customer.email) doc.text(customer.email, margin, 54);
    if (customer.phone) doc.text(customer.phone, margin, 59);
    if (customer.address) doc.text(customer.address, margin, 64);
  }

  // Items table
  const items = (data.items || []).map((item) => [
    item.description,
    String(item.quantity),
    `$${Number(item.unitPrice).toLocaleString()}`,
    `$${Number(item.totalPrice).toLocaleString()}`,
  ]);

  autoTable(doc, {
    startY: 72,
    head: [["Description", "Qty", "Unit Price", "Total"]],
    body: items,
    theme: "grid",
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontSize: 10 },
    bodyStyles: { fontSize: 10 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 20, halign: "center" },
      2: { cellWidth: 40, halign: "right" },
      3: { cellWidth: 40, halign: "right" },
    },
  });

  // Totals
  const finalY = (doc as any).lastAutoTable?.finalY || 120;
  const totalsX = pageWidth - margin - 60;

  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text("Subtotal:", totalsX, finalY + 10, { align: "left" });
  doc.text(`$${Number(data.subtotal).toLocaleString()}`, pageWidth - margin, finalY + 10, { align: "right" });

  doc.text("Tax:", totalsX, finalY + 16, { align: "left" });
  doc.text(`$${Number(data.taxAmount).toLocaleString()}`, pageWidth - margin, finalY + 16, { align: "right" });

  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text("Total:", totalsX, finalY + 24, { align: "left" });
  doc.text(`$${Number(data.totalAmount).toLocaleString()}`, pageWidth - margin, finalY + 24, { align: "right" });

  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text("Paid:", totalsX, finalY + 30, { align: "left" });
  doc.text(`$${Number(data.paidAmount).toLocaleString()}`, pageWidth - margin, finalY + 30, { align: "right" });

  const balance = Number(data.totalAmount) - Number(data.paidAmount);
  if (balance > 0) {
    doc.setTextColor(200, 50, 50);
    doc.text("Balance Due:", totalsX, finalY + 36, { align: "left" });
    doc.text(`$${balance.toLocaleString()}`, pageWidth - margin, finalY + 36, { align: "right" });
  }

  // Notes
  if (data.notes) {
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.text("Notes:", margin, finalY + 48);
    doc.text(data.notes, margin, finalY + 53);
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text("Thank you for your business.", pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });

  doc.save(`invoice-${data.invoiceNumber}.pdf`);
}

function formatDate(date: string | Date | null) {
  if (!date) return "-";
  try {
    return new Date(date).toLocaleDateString();
  } catch {
    return "-";
  }
}
