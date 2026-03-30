import re
from bs4 import BeautifulSoup

def main():
    with open('docs/AURA_Project_Report_v2_Final.html', 'r', encoding='utf-8') as f:
        html = f.read()

    soup = BeautifulSoup(html, 'html.parser')

    # Remove Paged.js scripts
    for script in soup.find_all('script'):
        if 'paged.polyfill.js' in script.get('src', ''):
            script.decompose()
            
    # Fix CSS
    for style in soup.find_all('style'):
        txt = style.string
        if txt and 'PAGED.JS A4 LAYOUT' in txt:
            style.string = txt.replace('/* === PAGED.JS A4 LAYOUT === */', '/* NATIVE STATIC PAGINATION */')
            # Remove pagedjs specific pseudo-classes
            style.string = style.string.replace('@page {', '/* @page removed')
            style.string = style.string.replace('@page front-matter {', '/* @page removed')

    # Fix typos in text globally
    for text_node in soup.find_all(string=True):
        if text_node.parent.name in ['script', 'style']:
            continue
            
        new_text = str(text_node)
        
        # Typos
        if 'avathar' in new_text.lower():
            new_text = re.sub(r'avathar', 'avatar', new_text, flags=re.IGNORECASE)
            
        # LipSync
        if 'Optional (API key required)' in new_text:
            new_text = new_text.replace('Optional (API key required)', 'Mandatory (API key required)')
            
        # ChromaDB
        if 'n=10' in new_text:
            new_text = new_text.replace('n=10', 'n=15')
            
        # LLM Chain Text Replacements
        if 'OpenRouter (primary) → Gemini 2.0 (fallback 1) → LLaMA-3 70B (fallback 2)' in new_text:
            new_text = new_text.replace(
                'OpenRouter (primary) → Gemini 2.0 (fallback 1) → LLaMA-3 70B (fallback 2)',
                'LLaMA-3 70B (primary) → OpenRouter (fallback 1)'
            )
        if 'comprising LLaMA-3 70B (NVIDIA NIM) as the primary provider, followed by OpenRouter (GPT-4o-mini) as the first fallback, and Google Gemini 2.0 Flash as the final fallback' in new_text:
             new_text = new_text.replace(
                'and Google Gemini 2.0 Flash as the final fallback',
                '(no secondary fallback used)'
            )

        if new_text != str(text_node):
            text_node.replace_with(new_text)
            
    # Modify SVG texts for Gemini and OpenRouter
    for svg_text in soup.find_all('text'):
        content = svg_text.get_text()
        if 'Gemini' in content:
            svg_text.string = "-"
        elif 'OpenRouter' in content and 'primary' in content.lower():
            svg_text.string = content.replace('OpenRouter', 'LLaMA-3 70B')
        elif 'LLaMA' in content and 'FB2' in content:
            svg_text.string = "OpenRouter (FB1)"

    # Flatten the document again
    elements = []
    content_div = soup.find('div', id='content')
    if content_div:
        for front_main in content_div.find_all('div', recursive=False):
            # 'front-matter' or 'main-matter'
            for child in front_main.contents:
                if child.name is None:
                    txt = child.string.strip() if child.string else ""
                    if not txt: continue
                elements.append(child)
        content_div.decompose()
    else:
        # Maybe it's still in `class="page"` if the previous script didn't save?
        pages = soup.find_all('div', class_='page')
        for p in pages:
            for child in list(p.contents):
                if child.name == 'div' and 'page-num' in child.get('class', []): continue
                if child.name is None:
                    txt = child.string.strip() if child.string else ""
                    if not txt: continue
                elements.append(child)
            p.decompose()

    # Re-paginate using Static HTML pages
    new_pages = []
    current_page = []
    current_height = 0
    MAX_HEIGHT = 860  # Optimized to reduce gaps but prevent overflow!
    
    in_front_matter = True
    front_matter_page_num = 1
    main_page_num = 1
    
    def finish_page():
        nonlocal current_page, current_height, new_pages, in_front_matter, front_matter_page_num, main_page_num
        if not current_page: return
        page_div = soup.new_tag('div')
        page_div['class'] = 'page'
        for el in current_page:
            page_div.append(el)
            
        has_chap_1 = any(el.name == 'h1' and 'Chapter 1' in el.get_text() for el in current_page if el.name)
        if has_chap_1:
            in_front_matter = False
            
        page_num_div = soup.new_tag('div')
        page_num_div['class'] = 'page-num'
            
        if in_front_matter:
            roman = ['i','ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii','xiii','xiv','xv', 'xvi', 'xvii', 'xviii']
            num_str = roman[front_matter_page_num - 1] if front_matter_page_num <= len(roman) else str(front_matter_page_num)
            page_num_div.string = num_str
            front_matter_page_num += 1
        else:
            page_num_div.string = str(main_page_num)
            main_page_num += 1
            
        page_div.append(page_num_div)
        new_pages.append(page_div)
        current_page = []
        current_height = 0

    for el in elements:
        h = 0
        if el.name:
            if el.name == 'h1':
                h = 70
                if current_height > 100: finish_page()
            elif el.name == 'div' and 'fm-heading' in el.get('class', []):
                h = 60
                if current_height > 100: finish_page()
            elif el.name == 'div' and 'cover' in el.get('class', []):
                h = 800
            elif el.name == 'table' and 'cover-table' in el.get('class', []):
                h = 200
            elif el.name == 'h2':
                h = 60
                if current_height + h > MAX_HEIGHT: finish_page()
            elif el.name == 'h3':
                h = 50
                if current_height + h > MAX_HEIGHT: finish_page()
            elif el.name == 'p':
                # Bold important keywords
                ptxt = el.get_text()
                keywords = ['LLaMA-3 70B', 'GPT-4o-mini', 'ChromaDB', 'OpenCV', 'Face-API', 'MediaPipe']
                for kw in keywords:
                    if kw in ptxt and not el.find('strong', string=kw):
                        new_content = str(el).replace(kw, f'<strong>{kw}</strong>')
                        try:
                            new_el = BeautifulSoup(new_content, 'html.parser').find('p')
                            if new_el: el = new_el
                        except: pass
                
                lines = max(1, len(ptxt) // 95)
                h = lines * 18 + 15
            elif el.name in ['ul', 'ol']:
                items = len(el.find_all('li'))
                h = items * 26 + 20
            elif el.name == 'table':
                rows = len(el.find_all('tr'))
                h = rows * 35 + 40
            elif el.name == 'div' and 'diagram-container' in el.get('class', []):
                svg = el.find('svg')
                if svg and svg.get('viewbox'):
                    # estimate height from viewbox
                    vb = svg.get('viewbox').split()
                    if len(vb) == 4:
                        v_width = float(vb[2])
                        v_height = float(vb[3])
                        # width is constrained to ~600px
                        h = min(v_height, 600 * (v_height/max(v_width, 1))) + 40
                    else:
                        h = 350
                else: h = 350
            elif el.name == 'div' and 'code-block' in el.get('class', []):
                lines = len(el.get_text().split('\\n'))
                h = lines * 18 + 30
            elif el.name == 'div' and 'toc-entry' in el.get('class', []):
                h = 25
            else:
                h = 30
                
            if current_height + h > MAX_HEIGHT and current_height > 100:
                finish_page()
                
            current_page.append(el)
            current_height += h
        else:
            current_page.append(el)
            
    finish_page()

    # Re-insert old style page containers
    wrapper = soup.new_tag('div', id='static-pages')
    for p in new_pages:
        wrapper.append(p)
    soup.body.append(wrapper)
    
    # We must ensure .page class has overflow: hidden so it ALWAYS looks like A4 on screen!
    # And we reduce bottom margin maybe.
    overrides = soup.new_tag('style')
    overrides.string = ".page { min-height: 297mm; height: 297mm; overflow: hidden; padding: 25mm 25mm 25mm 37.5mm; }"
    soup.head.append(overrides)

    with open('docs/AURA_Project_Report_v2_Final.html', 'w', encoding='utf-8') as f:
        f.write(str(soup))
        
    print(f"Rebuilt entirely explicitly! {len(new_pages)} exact A4 Pages.")

if __name__ == '__main__':
    main()
