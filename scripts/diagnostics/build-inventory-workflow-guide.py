#!/usr/bin/env python3
"""Build the operator guide from its manuscript and verified local screenshot manifest.

Authoring operation marker is a separate required PDF-skill step; this builder does not run it.
Use --check for read-only manuscript coverage checks. Final rendering requires a ready manifest.
"""
from __future__ import annotations
import argparse
import html
import hashlib
import json
import re
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parents[2]
MANUSCRIPT = ROOT / 'docs/product/inventory-workflow-operator-guide.md'
BASELINE = ROOT / 'docs/product/inventory-workflow.acceptance.json'
MANIFEST = ROOT / 'output/diagnostics/inventory-workflow/screenshots/manifest.json'
OUTPUT = ROOT / 'output/pdf/inventory-workflow-guide.pdf'
BUNDLE = Path('/Users/nshah/.cache/codex-runtimes/codex-primary-runtime/dependencies')
FONT_DIR = BUNDLE / 'node/node_modules/pdfjs-dist/standard_fonts'

PRIMARY_PAGE = {
 'INV-01':'today','INV-02':'today','INV-03':'stock-search','INV-04':'stock-detail',
 'INV-05':'stock-search','INV-06':'stock-detail','INV-07':'valuation-ledger','INV-08':'opening',
 'INV-09':'identities','INV-10':'capture','INV-11':'source-review','INV-12':'source-review',
 'INV-13':'identities','INV-14':'purchase-totals','INV-15':'save-review','INV-16':'save-review',
 'INV-17':'save-review','INV-18':'purchase-recovery','INV-19':'linked-documents',
 'INV-20':'linked-documents','INV-21':'supplier-payments','INV-22':'supplier-account',
 'INV-23':'capture','INV-24':'sales','INV-25':'sales','INV-26':'customer-return',
 'INV-27':'valuation-ledger','INV-28':'supplier-return','INV-29':'expiry-loss-hold',
 'INV-30':'expiry-loss-hold','INV-31':'count-adjust','INV-32':'count-adjust',
 'INV-33':'expiry-loss-hold','INV-34':'targets','INV-35':'shortbook','INV-36':'targets',
 'INV-37':'shortbook','INV-38':'purchase-order','INV-39':'stock-search','INV-40':'today',
 'INV-41':'today','INV-42':'reporting',
}


def read_source():
    baseline = json.loads(BASELINE.read_text())
    source = MANUSCRIPT.read_text()
    sections = []
    parts = re.split(r'<!-- page: ([\w-]+) -->\s*', source)
    for i in range(1, len(parts), 2):
        sections.append((parts[i], parts[i+1].strip()))
    feature_ids = {f['id'] for f in baseline['features']}
    references = set(re.findall(r'\bINV-\d{2}\b', source))
    assert len(feature_ids) == 42, 'Expected the complete 42-feature baseline'
    assert sum(len(f['criteria']) for f in baseline['features']) == 211, 'Acceptance criterion count changed'
    assert feature_ids <= references, f'Missing features: {feature_ids-references}'
    assert feature_ids == set(PRIMARY_PAGE), 'Feature index mapping must cover the exact baseline'
    assert set(PRIMARY_PAGE.values()) <= {slug for slug, _ in sections}, 'Invalid index destination'
    assert len({slug for slug, _ in sections}) == len(sections), 'Duplicate guide page slug'
    for token in ['Gmail/OAuth','supplier-email','three representative clinic staff','Manufacturer is optional','No reliable printed location','Reload saved invoice']:
        assert token in source, f'Missing required operator explanation: {token}'
    return baseline, source, sections


def load_screenshots(path: Path, explicitly_ready: bool):
    manifest = json.loads(path.read_text())
    if isinstance(manifest, dict):
        ready = manifest.get('ready') is True or str(manifest.get('status', '')).lower() in ('ready','complete','verified')
        entries = manifest.get('screenshots', manifest.get('captures', manifest.get('images', [])))
    else:
        ready, entries = False, manifest
    if not (ready or explicitly_ready):
        raise ValueError('Screenshot manifest is not ready. Await parent verification or pass --manifest-ready after explicit handoff.')
    if isinstance(entries, dict):
        entries = [dict(value, id=key) if isinstance(value,dict) else {'id':key,'path':value} for key,value in entries.items()]
    result = {}
    for entry in entries:
        if entry.get('useInGuide') is False:
            continue
        if entry.get('verified') is False:
            raise ValueError(f"Unverified screenshot cannot be used: {entry}")
        key = entry.get('id') or entry.get('key') or entry.get('name')
        raw = entry.get('path') or entry.get('file') or entry.get('filePath')
        if not key or not raw:
            raise ValueError('Each screenshot needs an ID and path')
        target = Path(raw)
        if not target.is_absolute():
            target = ROOT / target if (ROOT / target).exists() else path.parent / target
        target = target.resolve()
        if not target.is_relative_to(path.parent.resolve()):
            raise ValueError(f'Screenshot outside the parent capture directory: {target}')
        if not target.is_file():
            raise ValueError(f'Missing screenshot file: {target}')
        if key in result:
            raise ValueError(f'Duplicate screenshot ID: {key}')
        result[key] = dict(entry, path=target)
    if not result:
        raise ValueError('No verified screenshots in manifest')
    return result


def build(args):
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                    PageBreak, Table, TableStyle, Image, KeepTogether)
    from PIL import Image as PILImage
    baseline, source, sections = read_source()
    screenshots = load_screenshots(args.manifest, args.manifest_ready)
    for name, file in [('Guide','LiberationSans-Regular.ttf'),('GuideBold','LiberationSans-Bold.ttf'),('GuideItalic','LiberationSans-Italic.ttf')]:
        pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / file)))
    pdfmetrics.registerFontFamily('Guide', normal='Guide', bold='GuideBold', italic='GuideItalic', boldItalic='GuideBold')
    ink, muted, blue, line = (colors.HexColor(v) for v in ('#152A38','#536673','#166B78','#D5E0E3'))
    width, height = A4
    margin = 43
    content_width = width - 2*margin
    styles = {
      'title':ParagraphStyle('title',fontName='GuideBold',fontSize=27,leading=31,textColor=ink,spaceAfter=17),
      'h2':ParagraphStyle('h2',fontName='GuideBold',fontSize=13,leading=17,textColor=ink,spaceBefore=11,spaceAfter=7,keepWithNext=True),
      'body':ParagraphStyle('body',fontName='Guide',fontSize=10.4,leading=14.7,textColor=ink,spaceAfter=9),
      'step':ParagraphStyle('step',fontName='Guide',fontSize=10.4,leading=14.7,textColor=ink,leftIndent=17,firstLineIndent=-17,spaceAfter=8),
      'caption':ParagraphStyle('caption',fontName='GuideItalic',fontSize=8.6,leading=11.5,textColor=muted,spaceBefore=5,spaceAfter=12),
      'feature':ParagraphStyle('feature',fontName='Guide',fontSize=8.4,leading=11,textColor=blue,spaceAfter=12),
      'cell':ParagraphStyle('cell',fontName='Guide',fontSize=9.2,leading=12.5,textColor=ink),
      'cellhead':ParagraphStyle('cellhead',fontName='GuideBold',fontSize=9,leading=12,textColor=colors.white),
    }
    def inline(text):
        text = html.escape(text.replace('\u2011','-').replace('\u2013','-').replace('\u2014',' - '))
        return re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',text)
    def para(text, kind='body'):
        return Paragraph(inline(text),styles[kind])
    page_by_slug, used_shots, missing_slots = {}, [], []
    class GuideDoc(BaseDocTemplate):
        def afterFlowable(self, flowable):
            slug = getattr(flowable,'guide_slug',None)
            if slug:
                page_by_slug[slug]=self.page
                self.canv.bookmarkPage(slug)
                self.canv.addOutlineEntry(getattr(flowable,'guide_title',slug),slug,0,False)
    def page_frame(canvas, doc):
        canvas.saveState()
        canvas.setTitle('Inventory workflow - operator guide for P S Dermatology')
        canvas.setAuthor('P S Dermatology - Clinic management workflow')
        canvas.setFont('GuideBold',8)
        canvas.setFillColor(blue)
        canvas.drawString(margin,height-29,'P S DERMATOLOGY  /  INVENTORY WORKFLOW')
        canvas.setStrokeColor(line);canvas.setLineWidth(.6)
        canvas.line(margin,height-36,width-margin,height-36)
        canvas.line(margin,36,width-margin,36)
        canvas.setFont('Guide',8);canvas.setFillColor(muted)
        canvas.drawString(margin,23,'Operator guide - local validation edition - 14 September 2026')
        canvas.drawRightString(width-margin,23,f'{doc.page:02d}')
        canvas.restoreState()
    def table(rows, widths=None, header=True):
        data=[]
        for i,row in enumerate(rows):
            data.append([para(str(value),'cellhead' if i==0 and header else 'cell') for value in row])
        t=Table(data,colWidths=widths or [content_width/len(rows[0])]*len(rows[0]),repeatRows=1 if header else 0,hAlign='LEFT')
        commands=[('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('LINEBELOW',(0,0),(-1,-1),.4,line)]
        if header: commands += [('BACKGROUND',(0,0),(-1,0),blue)]
        for row in range(1,len(rows)):
            if row%2==0:commands.append(('BACKGROUND',(0,row),(-1,row),colors.HexColor('#F3F7F8')))
        t.setStyle(TableStyle(commands))
        return t
    args.output.parent.mkdir(parents=True,exist_ok=True)
    # Two deterministic builds let the feature index use actual page numbers after wrapping.
    final_doc=None
    for build_pass in range(2):
        story=[];used_shots.clear();missing_slots.clear()
        for index,(slug,body) in enumerate(sections):
            if index:story.append(PageBreak())
            lines=body.splitlines();i=0
            while i<len(lines):
                current=lines[i].strip()
                if not current:i+=1;continue
                if current.startswith('# '):
                    title=para(current[2:],'title');title.guide_slug=slug;title.guide_title=current[2:];story.append(title);i+=1;continue
                if current.startswith('## '):story.append(para(current[3:],'h2'));i+=1;continue
                if current.startswith('Features: '):story.append(para(current,'feature'));i+=1;continue
                shot=re.match(r'<!-- screenshot: ([\w-]+) \| (.+?) -->',current)
                if shot:
                    key,caption=shot.groups();actual_key={'stock-return':'supplier-return','sales-entry':'counter-sale'}.get(key,key);entry=screenshots.get(key) or screenshots.get(actual_key)
                    if entry:
                        with PILImage.open(entry['path']) as original:w,h=original.size
                        # Capture the complete original image; never crop or synthesize UI.
                        max_height=255
                        scale=min(content_width/w,max_height/h)
                        image=Image(str(entry['path']),width=w*scale,height=h*scale,hAlign='LEFT')
                        note=caption if key == 'invoice-review' else (entry.get('caption') or caption)
                        story.append(KeepTogether([image,para(note,'caption')]))
                        used_shots.append({'id':entry.get('id',actual_key),'path':str(entry['path']),'caption':note,'pageSlug':slug,'verifiedAt':entry.get('verifiedAt'),'inputSha256':hashlib.sha256(entry['path'].read_bytes()).hexdigest()})
                    else:missing_slots.append(key)
                    i+=1;continue
                if current=='<!-- feature-index -->':
                    rows=[['Feature','Destination / task','Guide page']]
                    for feature in baseline['features']:
                        target=PRIMARY_PAGE[feature['id']]
                        rows.append([feature['id'],f"{feature['area']} / {feature['title']}",str(page_by_slug.get(target,'-'))])
                    index_table=table(rows,[58,content_width-116,58])
                    index_table.setStyle(TableStyle([('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
                    story.append(index_table);i+=1;continue
                if current.startswith('|'):
                    rows=[]
                    while i<len(lines) and lines[i].strip().startswith('|'):
                        row=[cell.strip() for cell in lines[i].strip().strip('|').split('|')]
                        if not all(re.fullmatch(r':?-+:?',cell.replace(' ','')) for cell in row):rows.append(row)
                        i+=1
                    col_widths=([123,195,content_width-318] if len(rows[0])==3 else [content_width*.68,content_width*.32])
                    story += [table(rows,col_widths),Spacer(1,11)];continue
                if re.match(r'^\d+\. ',current):story.append(para(current,'step'));i+=1;continue
                if current.startswith('<!--'):i+=1;continue
                paragraph=[current];i+=1
                while i<len(lines) and lines[i].strip() and not re.match(r'^(#|\d+\. |\||<!--|Features:)',lines[i].strip()):paragraph.append(lines[i].strip());i+=1
                story.append(para(' '.join(paragraph)))
        final_doc=GuideDoc(str(args.output),pagesize=A4,leftMargin=margin,rightMargin=margin,topMargin=53,bottomMargin=49)
        final_doc.addPageTemplates(PageTemplate(id='guide',frames=[Frame(margin,49,content_width,height-102,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)],onPage=page_frame))
        final_doc.build(story)
    from pypdf import PdfReader
    reader=PdfReader(str(args.output))
    text='\n'.join(page.extract_text() or '' for page in reader.pages)
    for feature in baseline['features']:assert feature['id'] in text,f"Feature missing in PDF: {feature['id']}"
    assert 20<=len(reader.pages)<=30,f'Expected about 20-30 pages, got {len(reader.pages)}'
    assert used_shots,'Final guide requires actual screenshots'
    # This is structural verification. Visual acceptance remains a separate render-and-inspect gate.
    qa={'output':str(args.output),'pages':len(reader.pages),'features':len(baseline['features']),'criteriaInCompanion':sum(len(f['criteria']) for f in baseline['features']),
        'usedScreenshots':used_shots,'unusedOptionalSlots':missing_slots,'pageIndex':page_by_slug,'visualInspection':'pending'}
    qa_path=ROOT/'tmp/pdfs/inventory-workflow-guide-qa.json';qa_path.parent.mkdir(parents=True,exist_ok=True);qa_path.write_text(json.dumps(qa,indent=2))
    print(json.dumps({'pages':qa['pages'],'features':qa['features'],'criteriaInCompanion':qa['criteriaInCompanion'],'screenshots':len(used_shots),'output':str(args.output),'qa':str(qa_path)}))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true',help='Validate manuscript and baseline without creating a PDF')
    parser.add_argument('--manifest',type=Path,default=MANIFEST)
    parser.add_argument('--manifest-ready',action='store_true',help='Use only after the parent explicitly hands off the verified capture manifest')
    parser.add_argument('--output',type=Path,default=OUTPUT)
    args=parser.parse_args()
    if args.check:
        baseline,source,sections=read_source()
        print(f"PASS: {len(baseline['features'])} features, {sum(len(f['criteria']) for f in baseline['features'])} companion criteria, {len(sections)} manuscript sections, all required boundaries covered")
        return
    build(args)

if __name__=='__main__':main()
