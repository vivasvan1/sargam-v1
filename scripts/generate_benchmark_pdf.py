#!/usr/bin/env python3
"""
Sargam-V1 Benchmark PDF Generator
Renders publication-grade benchmark report with Git metadata, KPI summary cards,
per-raga evaluation tables, and transcribed Sargam notations.
"""

import sys
import os
import json
from datetime import datetime

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    KeepTogether,
    HRFlowable,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#71717A"))
        
        # Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(54, 750, "Sargam-V1 Audio Transcription Benchmark Report")
            commit_text = self._commit_hash[:8] if hasattr(self, '_commit_hash') else ""
            self.drawRightString(558, 750, f"Git Commit: {commit_text}")
            self.setStrokeColor(colors.HexColor("#E4E4E7"))
            self.setLineWidth(0.5)
            self.line(54, 744, 558, 744)

        # Footer (all pages)
        self.setStrokeColor(colors.HexColor("#E4E4E7"))
        self.setLineWidth(0.5)
        self.line(54, 45, 558, 45)
        self.drawString(54, 32, "Confidential - Sargam-V1 MIR Evaluation - Saraga Hindustani Dataset")
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(558, 32, page_text)
        self.restoreState()


def build_pdf(json_path: str, output_pdf_path: str):
    with open(json_path, 'r') as f:
        data = json.load(f)

    doc = SimpleDocTemplate(
        output_pdf_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54,
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=22,
        leading=26,
        textColor=colors.HexColor('#0F172A'),
        spaceAfter=4,
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#475569'),
        spaceAfter=14,
    )

    h2_style = ParagraphStyle(
        'SectionH2',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=colors.HexColor('#0F172A'),
        spaceBefore=12,
        spaceAfter=8,
    )

    meta_label_style = ParagraphStyle(
        'MetaLabel',
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor('#334155'),
    )

    meta_val_style = ParagraphStyle(
        'MetaVal',
        fontName='Helvetica',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor('#0F172A'),
    )

    body_style = ParagraphStyle(
        'BodyDark',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#1E293B'),
    )

    table_header_style = ParagraphStyle(
        'TableHead',
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor('#FFFFFF'),
        alignment=1, # Center
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        fontName='Helvetica',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor('#0F172A'),
    )

    table_cell_center = ParagraphStyle(
        'TableCellCenter',
        fontName='Helvetica',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor('#0F172A'),
        alignment=1,
    )

    code_style = ParagraphStyle(
        'CodeStyle',
        fontName='Courier',
        fontSize=7,
        leading=8.5,
        textColor=colors.HexColor('#1E293B'),
    )

    story = []

    # Title & Subtitle
    story.append(Paragraph("Sargam-V1 Audio Transcription Benchmark Report", title_style))
    story.append(Paragraph(
        "Standardized International MIREX & Indian MIR Performance Evaluation Across Saraga Hindustani Recordings & Acoustic Reference Audio",
        subtitle_style
    ))

    # Metadata Card Table
    git_commit = data.get('gitCommit', 'N/A')
    git_branch = data.get('gitBranch', 'main')
    timestamp = data.get('timestamp', datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    total_tracks = len(data.get('tracks', []))

    meta_data = [
        [
            Paragraph("<b>Git Commit Hash:</b>", meta_label_style),
            Paragraph(f"<font color='#0284C7'><b>{git_commit}</b></font>", meta_val_style),
            Paragraph("<b>Git Branch:</b>", meta_label_style),
            Paragraph(f"<b>{git_branch}</b>", meta_val_style),
        ],
        [
            Paragraph("<b>Benchmark Date:</b>", meta_label_style),
            Paragraph(timestamp, meta_val_style),
            Paragraph("<b>Dataset Evaluated:</b>", meta_label_style),
            Paragraph(f"Saraga 1.5 Hindustani ({total_tracks} Tracks)", meta_val_style),
        ],
        [
            Paragraph("<b>Runtime / Engine:</b>", meta_label_style),
            Paragraph("TypeScript pYIN Viterbi Trellis Engine", meta_val_style),
            Paragraph("<b>Audio Formats:</b>", meta_label_style),
            Paragraph("Vocal (Alap & Bandish) & Plucked Sitar", meta_val_style),
        ]
    ]

    meta_table = Table(meta_data, colWidths=[105, 175, 105, 119])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#CBD5E1')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 12))

    # Executive Summary / Aggregated KPIs
    agg = data.get('aggregated', {})
    story.append(Paragraph("1. Executive Summary & Aggregated Accuracy Measures", h2_style))

    kpi_cards = [
        [
            Paragraph("<b>Raw Pitch Accuracy (RPA)</b>", meta_label_style),
            Paragraph("<b>Raw Chroma Accuracy (RCA)</b>", meta_label_style),
            Paragraph("<b>Overall Accuracy (OA)</b>", meta_label_style),
            Paragraph("<b>Voicing False Alarm</b>", meta_label_style),
        ],
        [
            Paragraph(f"<font size=12 color='#0284C7'><b>{agg.get('pyinMeanRPA', 0):.2f}%</b></font><br/><font size=7 color='#15803D'>Baseline: {agg.get('yinMeanRPA', 0):.2f}%</font>", meta_val_style),
            Paragraph(f"<font size=12 color='#0284C7'><b>{agg.get('pyinMeanRCA', 0):.2f}%</b></font><br/><font size=7 color='#15803D'>Baseline: {agg.get('yinMeanRCA', 0):.2f}%</font>", meta_val_style),
            Paragraph(f"<font size=12 color='#0284C7'><b>{agg.get('pyinMeanOA', 0):.2f}%</b></font><br/><font size=7 color='#15803D'>Baseline: {agg.get('yinMeanOA', 0):.2f}%</font>", meta_val_style),
            Paragraph(f"<font size=12 color='#15803D'><b>{agg.get('pyinMeanVFA', 0):.2f}%</b></font><br/><font size=7 color='#DC2626'>Baseline: {agg.get('yinMeanVFA', 0):.2f}%</font>", meta_val_style),
        ],
        [
            Paragraph("<b>Octave Error Rate (OCR)</b>", meta_label_style),
            Paragraph("<b>Median Cents Error (MCE)</b>", meta_label_style),
            Paragraph("<b>Voicing Recall (VR)</b>", meta_label_style),
            Paragraph("<b>Real-Time Throughput</b>", meta_label_style),
        ],
        [
            Paragraph(f"<font size=12 color='#15803D'><b>{agg.get('pyinMeanOCR', 0):.2f}%</b></font><br/><font size=7 color='#DC2626'>Baseline: {agg.get('yinMeanOCR', 0):.2f}%</font>", meta_val_style),
            Paragraph(f"<font size=12 color='#0284C7'><b>{agg.get('pyinMeanMCE', 0):.2f}c</b></font><br/><font size=7 color='#475569'>Baseline: {agg.get('yinMeanMCE', 0):.2f}c</font>", meta_val_style),
            Paragraph(f"<font size=12 color='#0284C7'><b>{agg.get('pyinMeanVR', 0):.2f}%</b></font><br/><font size=7 color='#475569'>Baseline: {agg.get('yinMeanVR', 0):.2f}%</font>", meta_val_style),
            Paragraph(f"<font size=12 color='#0284C7'><b>{agg.get('meanRTF', 0):.1f}x RT</b></font><br/><font size=7 color='#15803D'>Sub-second Ingest</font>", meta_val_style),
        ]
    ]

    kpi_table = Table(kpi_cards, colWidths=[126, 126, 126, 126])
    kpi_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F1F5F9')),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#CBD5E1')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 10))

    # Summary narrative
    narrative = (
        f"<b>Benchmark Highlights:</b> Across <b>{total_tracks} comprehensive test performances</b> spanning 20 Hindustani ragas and reference acoustic tracks, "
        f"the improved Probabilistic YIN (pYIN) engine achieves an overall mean <b>Raw Chroma Accuracy of {agg.get('pyinMeanRCA', 0):.2f}%</b> and "
        f"an <b>Overall Accuracy of {agg.get('pyinMeanOA', 0):.2f}%</b>. Subharmonic alias suppression and Bayesian voicing probability reduced false alarms "
        f"from tanpura drone acoustic noise down to <b>{agg.get('pyinMeanVFA', 0):.2f}%</b> (a reduction of <b>{agg.get('yinMeanVFA', 0) - agg.get('pyinMeanVFA', 0):.2f}%</b> over baseline YIN), "
        f"while bounding octave confusion to an average of <b>{agg.get('pyinMeanOCR', 0):.2f}%</b>."
    )
    story.append(Paragraph(narrative, body_style))
    story.append(Spacer(1, 12))

    # Per-Raga Detailed Table
    story.append(Paragraph("2. Per-Raga Benchmark Performance Matrix", h2_style))

    table_data = [[
        Paragraph("<b>Raga / Track</b>", table_header_style),
        Paragraph("<b>Artist</b>", table_header_style),
        Paragraph("<b>Sa (Hz)</b>", table_header_style),
        Paragraph("<b>Baseline RPA</b>", table_header_style),
        Paragraph("<b>pYIN RPA</b>", table_header_style),
        Paragraph("<b>RPA &Delta;</b>", table_header_style),
        Paragraph("<b>pYIN RCA</b>", table_header_style),
        Paragraph("<b>Overall Acc</b>", table_header_style),
        Paragraph("<b>Octave Err</b>", table_header_style),
    ]]

    for t in data.get('tracks', []):
        rpa_delta = t['pyinRPA'] - t['yinRPA']
        delta_color = '#15803D' if rpa_delta >= 0 else '#DC2626'
        delta_str = f"+{rpa_delta:.1f}%" if rpa_delta >= 0 else f"{rpa_delta:.1f}%"

        table_data.append([
            Paragraph(f"<b>{t['name']}</b>", table_cell_style),
            Paragraph(t.get('artist', 'Vocalist'), table_cell_style),
            Paragraph(f"{t['saFreq']:.1f}", table_cell_center),
            Paragraph(f"{t['yinRPA']:.1f}%", table_cell_center),
            Paragraph(f"<b>{t['pyinRPA']:.1f}%</b>", table_cell_center),
            Paragraph(f"<font color='{delta_color}'><b>{delta_str}</b></font>", table_cell_center),
            Paragraph(f"{t['pyinRCA']:.1f}%", table_cell_center),
            Paragraph(f"<b>{t['pyinOA']:.1f}%</b>", table_cell_center),
            Paragraph(f"{t['pyinOCR']:.1f}%", table_cell_center),
        ])

    matrix_table = Table(
        table_data,
        colWidths=[85, 75, 40, 50, 50, 48, 50, 54, 52],
        repeatRows=1,
    )
    matrix_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#FFFFFF'), colors.HexColor('#F8FAFC')]),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(matrix_table)
    story.append(Spacer(1, 14))

    # Transcribed Sargam Notation Section
    story.append(Paragraph("3. Sample Transcribed Sargam Notations (Free Rhythm & Flexible Quantization)", h2_style))
    sample_desc = (
        "The audio transcription engine converts continuous pitch trajectories into idiomatic Indian classical "
        "Sargam notation. Using event-driven segmentation and natural duration quantification, it preserves true "
        "phrase timing, breath rests, and microtonal ornamentation (meends and kans):"
    )
    story.append(Paragraph(sample_desc, body_style))
    story.append(Spacer(1, 6))

    for t in data.get('tracks', [])[:6]: # Show top 6 sample sargam notations
        if 'sargamSample' in t and t['sargamSample']:
            story.append(Paragraph(f"<b>{t['name']} ({t.get('artist', 'Vocal')}) &mdash; Sa = {t['saFreq']:.1f} Hz:</b>", meta_label_style))
            story.append(Spacer(1, 2))
            story.append(Paragraph(f"<font color='#0F766E'><code>{t['sargamSample']}</code></font>", code_style))
            story.append(Spacer(1, 4))

    story.append(Spacer(1, 10))

    # Algorithmic Methodology Section
    story.append(Paragraph("4. Algorithmic Architecture & Verification Methodology", h2_style))
    method_text = (
        "<b>1. Multi-Threshold CMNDF Peak Extraction:</b> Rather than using a single greedy threshold, the Cumulative Mean Normalized "
        "Difference Function is probed across 11 threshold candidate levels (0.03 to 0.42). Votes are dynamically aggregated to form an empirical "
        "candidate likelihood distribution.<br/>"
        "<b>2. Subharmonic Period Doubling / Quadrupling Elimination:</b> To prevent low-frequency Tanpura drone lock (e.g. 74 Hz on D3 tonic), "
        "candidates are cross-checked against harmonic sub-periods (&tau;/2, &tau;/4). If a plausible sub-period dip exists, the fundamental period "
        "is preserved, preventing octave downward flipping.<br/>"
        "<b>3. Bayesian Calibrated Voicing Probability:</b> Voiced probability pVoiced is dynamically scaled as (1 - bestCmnd) balanced against RMS "
        "acoustic energy, preventing soft vocal transitions from being erroneously dropped as unvoiced frames.<br/>"
        "<b>4. Viterbi Dynamic Trellis Smoothing:</b> A top-K beam search trellis evaluates transition probabilities across successive frames, "
        "penalizing sudden unphysical frequency jumps and suppressing isolated 1-frame spikes while maintaining sub-second execution throughput."
    )
    story.append(Paragraph(method_text, body_style))

    # Build the document
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Benchmark PDF successfully generated: {output_pdf_path}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: generate_benchmark_pdf.py <results.json> <output.pdf>")
        sys.exit(1)
    build_pdf(sys.argv[1], sys.argv[2])
