#!/usr/bin/env python3
"""Coolpool Phase 2 progress report PDF — done vs pending."""
from datetime import date
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import HRFlowable, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

FONT = "ArialUni"
pdfmetrics.registerFont(TTFont(FONT, "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"))

PURPLE = colors.HexColor("#6C5CE7")
INK = colors.HexColor("#241d2b")
MUTED = colors.HexColor("#6f6678")
LINE = colors.HexColor("#e6e0ec")
MIST = colors.HexColor("#f6f3f9")
GREEN = colors.HexColor("#0F6E56")
GREENBG = colors.HexColor("#eaf5ef")
AMBER = colors.HexColor("#8a5a00")
AMBERBG = colors.HexColor("#fdf3e2")
REDBG = colors.HexColor("#fbeeed")
RED = colors.HexColor("#a3311d")

OUT = "/Users/ashiq/Documents/Coolpool-Phase2-Progress-Report.pdf"
doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=16*mm, rightMargin=16*mm, topMargin=14*mm, bottomMargin=14*mm,
                        title="Coolpool Phase 2 — Progress Report", author="Ashiq")

S = {
    "h1": ParagraphStyle("h1", fontName=FONT, fontSize=21, leading=25, textColor=INK),
    "accent": ParagraphStyle("accent", fontName=FONT, fontSize=10, leading=14, textColor=PURPLE),
    "meta": ParagraphStyle("meta", fontName=FONT, fontSize=9, leading=13, textColor=MUTED, alignment=2),
    "h2": ParagraphStyle("h2", fontName=FONT, fontSize=13, leading=16, textColor=INK, spaceBefore=12, spaceAfter=5),
    "cell": ParagraphStyle("cell", fontName=FONT, fontSize=9, leading=12, textColor=INK),
    "cellb": ParagraphStyle("cellb", fontName=FONT, fontSize=9, leading=12, textColor=INK),
    "small": ParagraphStyle("small", fontName=FONT, fontSize=8.5, leading=11.5, textColor=MUTED),
    "body": ParagraphStyle("body", fontName=FONT, fontSize=9.4, leading=13.6, textColor=INK),
    "pill": ParagraphStyle("pill", fontName=FONT, fontSize=8.5, leading=11, textColor=colors.white, alignment=1),
}
story = []
today = date.today().strftime("%d %B %Y")

# Header
head = Table([
    [Paragraph("<b>PROGRESS REPORT</b>", S["h1"]),
     Paragraph(f"<b>Ashiq</b><br/>+91 62820 65969<br/>connecttoashiq@gmail.com<br/>{today}", S["meta"])],
    [Paragraph("Coolpool — Phase 2 development status", S["accent"]), ""],
], colWidths=[112*mm, 66*mm])
head.setStyle(TableStyle([("SPAN",(0,1),(1,1)),("VALIGN",(0,0),(-1,-1),"TOP"),
    ("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0),("BOTTOMPADDING",(0,0),(-1,-1),2)]))
story += [head, Spacer(1,4), HRFlowable(width="100%", thickness=1.2, color=PURPLE), Spacer(1,4)]

# Summary line
story.append(Paragraph(
    "All Phase 2 features that don't depend on the client's third-party accounts are <b>built, tested and live on coolpool.in</b>. "
    "The remaining items are blocked only on external account setup (verification provider, RazorpayX, SMS template) — not on development. "
    "Below: what's live, what's waiting, and what each pending item needs.",
    S["body"]))

def status_pill(text, bg):
    t = Table([[Paragraph(f"<b>{text}</b>", S["pill"])]], colWidths=[26*mm])
    t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),bg),("TOPPADDING",(0,0),(-1,-1),3),
        ("BOTTOMPADDING",(0,0),(-1,-1),3),("ROUNDEDCORNERS",[4,4,4,4])]))
    return t

def feature_table(rows):
    data = [[Paragraph("<b>Feature</b>", S["cell"]), Paragraph("<b>What it does now</b>", S["cell"]), Paragraph("<b>Status</b>", S["cell"])]]
    styles = [("BACKGROUND",(0,0),(-1,0),MIST),("LINEBELOW",(0,0),(-1,0),0.8,PURPLE),
              ("GRID",(0,1),(-1,-1),0.4,LINE),("VALIGN",(0,0),(-1,-1),"TOP"),
              ("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4),
              ("LEFTPADDING",(0,0),(-1,-1),5),("RIGHTPADDING",(0,0),(-1,-1),5)]
    for i,(name,desc,pill,bg) in enumerate(rows,1):
        data.append([Paragraph(f"<b>{name}</b>", S["cellb"]), Paragraph(desc, S["cell"]), status_pill(pill,bg)])
    t = Table(data, colWidths=[42*mm, 106*mm, 30*mm])
    t.setStyle(TableStyle(styles))
    return t

# DONE
story.append(Paragraph("Delivered &amp; live", S["h2"]))
story.append(feature_table([
    ("Start-trip timing", "Button now shows early with a live countdown (“Starts in 12m”) and only becomes clickable 5 minutes before departure — with a guard so it can't fire early.", "LIVE", GREEN),
    ("360° location views", "Guests see a 360° street view of the drop-off; hosts see the pickup. Falls back gracefully where imagery isn't available.", "LIVE", GREEN),
    ("Private selfie verification", "Members submit a selfie for a verified badge. Stored privately — only admins can view it. Admin approve/reject queue included.", "LIVE", GREEN),
    ("Guest no-show proof", "Host must capture a GPS-stamped photo before marking a guest no-show; filed for admin review.", "LIVE", GREEN),
    ("Host no-show fine (Rs. 50/seat)", "Deduction mechanism is live in the payout ledger; a fine is applied from the host's earnings with a reason.", "LIVE", GREEN),
    ("Admin verifications panel", "New admin section to review selfies and no-show photos, with private image viewing and resolve actions.", "LIVE", GREEN),
]))

# PENDING
story.append(Paragraph("Pending — blocked on external setup (not development)", S["h2"]))
story.append(feature_table([
    ("OTP auto-fill on keyboard", "App side is built. Needs a new DLT-approved SMS template on your PowersText account before it fully activates.", "NEEDS SMS", AMBER),
    ("Driving licence verification", "Verification flow + admin review ready to wire. Needs a verification-provider account in your business name.", "NEEDS ACCOUNT", RED),
    ("Vehicle RC verification", "Same as above — ready to wire once the provider account is active.", "NEEDS ACCOUNT", RED),
    ("Aadhaar verification (hosts)", "Secure OTP/DigiLocker flow, via a licensed provider — needs the provider account + your business KYC docs.", "NEEDS ACCOUNT", RED),
    ("Automatic payouts to hosts", "Payout logic built on the ledger; automatic bank transfer needs RazorpayX activation on your Razorpay account.", "NEEDS RAZORPAYX", RED),
]))

story.append(Spacer(1,6))
story.append(Paragraph("To unblock the pending items (your side)", S["h2"]))
for t in [
    "<b>Verification provider account</b> (for licence / RC / Aadhaar) — registered in your business name, with GST/PAN + owner Aadhaar. Approval takes a few days.",
    "<b>RazorpayX activation</b> on your existing Razorpay account — for automatic host payouts.",
    "<b>New SMS template</b> via PowersText (DLT-approved) — for OTP auto-fill. DLT approval is the slowest, so start this first.",
]:
    story.append(Paragraph("•  " + t, S["body"]))
story.append(Spacer(1,3))
story.append(Paragraph("Once these accounts are active, wiring each verification and the automatic payout is quick — the flows and admin review are already built.", S["small"]))

# Page 2 — bonus
story.append(PageBreak())
story.append(Paragraph("Also delivered during this engagement (beyond Phase 2)", S["h2"]))
story.append(Paragraph("Production fixes and improvements shipped alongside Phase 2:", S["body"]))
bonus = [
    "Fixed a payment bug where a paid booking across two accounts failed to record — bookings are now finalised securely on the server.",
    "Fixed segment pricing showing Rs. 0 for intermediate stops — hosts' exact per-segment prices are now honoured.",
    "Fixed South-India places (e.g. Kamalanagar) being wrongly rejected as out-of-area.",
    "Rebuilt the pickup / drop-off input boxes so long place names always display correctly on Android.",
    "Unified admin payout ledger — status chips, deductions with reasons, part-payments, and an “add payment” record.",
    "Live tracking: full-screen map, a car icon that faces the direction of travel, follow-the-car mode.",
    "Traveler signup now uses phone OTP and routes existing numbers to sign-in.",
    "Trip card and trending-routes layout fixes; scrollable admin sidebar.",
]
for b in bonus:
    story.append(Paragraph("•  " + b, S["body"]))

story.append(Paragraph("Infrastructure groundwork (in progress, no downtime)", S["h2"]))
story.append(Paragraph(
    "Preparation to move Coolpool onto AWS with a managed PostgreSQL database (replacing the current self-hosted backend) is underway and proven on a copy of live data — existing users keep their same login, nothing is lost. This is a background track; it does not affect the Phase 2 timeline and goes live only after full testing.",
    S["body"]))

story.append(Spacer(1,10))
story.append(HRFlowable(width="100%", thickness=0.6, color=LINE))
story.append(Spacer(1,4))
story.append(Paragraph("Prepared by Ashiq · connecttoashiq@gmail.com · +91 62820 65969", S["small"]))

doc.build(story)
print("OK", OUT)
