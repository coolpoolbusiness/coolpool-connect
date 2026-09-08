#!/usr/bin/env python3
"""Coolpool Phase 2 — documents & accounts checklist PDF (client-facing)."""
from datetime import date
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

FONT = "ArialUni"
pdfmetrics.registerFont(TTFont(FONT, "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"))

PURPLE = colors.HexColor("#6C5CE7")
INK = colors.HexColor("#241d2b")
MUTED = colors.HexColor("#6f6678")
LINE = colors.HexColor("#e6e0ec")
MIST = colors.HexColor("#f6f3f9")
GREEN = colors.HexColor("#0F6E56")
AMBER = colors.HexColor("#8a5a00")

OUT = "/Users/ashiq/Documents/Coolpool-Documents-Checklist.pdf"
doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=16*mm, rightMargin=16*mm, topMargin=14*mm, bottomMargin=14*mm,
                        title="Coolpool — Documents & Accounts Checklist", author="Ashiq")

S = {
    "h1": ParagraphStyle("h1", fontName=FONT, fontSize=20, leading=24, textColor=INK),
    "accent": ParagraphStyle("accent", fontName=FONT, fontSize=10, leading=14, textColor=PURPLE),
    "meta": ParagraphStyle("meta", fontName=FONT, fontSize=9, leading=13, textColor=MUTED, alignment=2),
    "h2": ParagraphStyle("h2", fontName=FONT, fontSize=12.5, leading=15, textColor=INK, spaceBefore=11, spaceAfter=4),
    "cell": ParagraphStyle("cell", fontName=FONT, fontSize=9, leading=12, textColor=INK),
    "num": ParagraphStyle("num", fontName=FONT, fontSize=9, leading=12, textColor=PURPLE, alignment=1),
    "small": ParagraphStyle("small", fontName=FONT, fontSize=8.5, leading=11.5, textColor=MUTED),
    "body": ParagraphStyle("body", fontName=FONT, fontSize=9.4, leading=13.6, textColor=INK),
    "pill": ParagraphStyle("pill", fontName=FONT, fontSize=8, leading=10.5, textColor=colors.white, alignment=1),
}
story = []
today = date.today().strftime("%d %B %Y")

head = Table([
    [Paragraph("<b>DOCUMENTS &amp; ACCOUNTS CHECKLIST</b>", S["h1"]),
     Paragraph(f"<b>Ashiq</b><br/>+91 62820 65969<br/>connecttoashiq@gmail.com<br/>{today}", S["meta"])],
    [Paragraph("Coolpool — to activate verification, auto-payout &amp; OTP features", S["accent"]), ""],
], colWidths=[116*mm, 62*mm])
head.setStyle(TableStyle([("SPAN",(0,1),(1,1)),("VALIGN",(0,0),(-1,-1),"TOP"),
    ("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0),("BOTTOMPADDING",(0,0),(-1,-1),2)]))
story += [head, Spacer(1,4), HRFlowable(width="100%", thickness=1.2, color=PURPLE), Spacer(1,5)]

story.append(Paragraph(
    "Please share the items below — collected <b>once</b>. They are used only to register the required "
    "services in your business name, kept strictly confidential, and never shared beyond the official providers.",
    S["body"]))

def checklist(title, rows):
    story.append(Paragraph(title, S["h2"]))
    data = []
    for i, txt in enumerate(rows, 1):
        data.append([Paragraph("☐", S["num"]), Paragraph(txt, S["cell"])])
    t = Table(data, colWidths=[9*mm, 169*mm])
    t.setStyle(TableStyle([
        ("VALIGN",(0,0),(-1,-1),"TOP"),
        ("LINEBELOW",(0,0),(-1,-2),0.4,LINE),
        ("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4),
        ("LEFTPADDING",(0,0),(-1,-1),3),("RIGHTPADDING",(0,0),(-1,-1),3),
    ]))
    story.append(t)

checklist("1 · Business identity", [
    "<b>Business PAN card</b> (company or proprietor)",
    "<b>GST certificate</b> — or a note saying “not GST-registered”",
    "<b>Business registration proof</b> — incorporation certificate (companies only; skip if sole proprietor)",
    "<b>Business address proof</b> — utility bill or rent agreement",
])
checklist("2 · Owner / authorized person", [
    "<b>Owner's PAN</b> (personal)",
    "<b>Owner's Aadhaar</b> (front image)",
    "<b>Name, mobile number &amp; email</b> of the authorized person (setup OTPs are sent here)",
])
checklist("3 · Bank (for host payouts)", [
    "<b>Business bank account</b> — cancelled cheque, or account number + IFSC",
])
checklist("4 · Access to existing accounts", [
    "<b>Razorpay dashboard</b> — owner access, or add Ashiq as a team member (for automatic payouts)",
    "<b>SMS / DLT account</b> (PowersText) — login + registered sender ID (for OTP on keyboard)",
    "<b>Support email &amp; phone</b> to show on app/store listings",
])

def pill(text, bg):
    p = Table([[Paragraph(f"<b>{text}</b>", S["pill"])]], colWidths=[24*mm])
    p.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),bg),("TOPPADDING",(0,0),(-1,-1),2.5),
        ("BOTTOMPADDING",(0,0),(-1,-1),2.5),("ROUNDEDCORNERS",[4,4,4,4])]))
    return p

story.append(Paragraph("What each unlocks — and the fastest route", S["h2"]))
data = [[Paragraph("<b>Account to set up</b>", S["cell"]), Paragraph("<b>Enables</b>", S["cell"]),
         Paragraph("<b>Fastest route</b>", S["cell"]), Paragraph("<b>Time</b>", S["cell"])]]
for a, b, c, t, bg in [
    ("SMS / DLT template", "OTP appears on keyboard", "Add one new template on your existing SMS account", "1–3 days", AMBER),
    ("Verification provider", "Licence, RC &amp; Aadhaar checks", "Self-serve signup; sandbox works instantly", "1–2 days", GREEN),
    ("RazorpayX", "Automatic bank payouts to hosts", "Enable on your existing Razorpay account", "1–2 days", GREEN),
]:
    data.append([Paragraph(f"<b>{a}</b>", S["cell"]), Paragraph(b, S["cell"]), Paragraph(c, S["cell"]), pill(t, bg)])
tt = Table(data, colWidths=[40*mm, 52*mm, 60*mm, 26*mm])
tt.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),MIST),("LINEBELOW",(0,0),(-1,0),0.8,PURPLE),
    ("GRID",(0,1),(-1,-1),0.4,LINE),("VALIGN",(0,0),(-1,-1),"MIDDLE"),
    ("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4),
    ("LEFTPADDING",(0,0),(-1,-1),5),("RIGHTPADDING",(0,0),(-1,-1),5)]))
story.append(tt)

story.append(Spacer(1, 5))
story.append(Paragraph(
    "<b>Please start the SMS / DLT template first</b> — it takes the longest to approve. Everything else is set up "
    "as soon as the documents above are received; the features themselves are already built and waiting.",
    S["body"]))

story.append(Spacer(1, 8))
story.append(HRFlowable(width="100%", thickness=0.6, color=LINE))
story.append(Spacer(1, 3))
story.append(Paragraph("Prepared by Ashiq · connecttoashiq@gmail.com · +91 62820 65969", S["small"]))

doc.build(story)
print("OK", OUT)
