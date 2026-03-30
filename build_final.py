import re
import markdown
from bs4 import BeautifulSoup

def main():
    with open('docs/AURA_FULL_PROJECT_THESIS_REPORT.md', 'r', encoding='utf-8') as f:
        md_text = f.read()

    # --- Pre-process Markdown Text ---
    # 1. Fallback chain correction
    md_text = md_text.replace(
        'OpenRouter (primary) → Gemini 2.0 (fallback 1) → LLaMA-3 70B (fallback 2)',
        'LLaMA-3 70B (primary) → OpenRouter (fallback 1)'
    )
    md_text = md_text.replace(
        'NVIDIA -> Google -> OpenRouter',
        'NVIDIA -> OpenRouter'
    )
    md_text = md_text.replace(
        'Gemini 2.0 Flash',
        'OpenRouter'
    )
    md_text = md_text.replace(
        'OpenRouter (GPT-4o-mini',
        'GPT-4o-mini'
    )

    # 2. 'avathar' to 'avatar'
    md_text = re.sub(r'avathar', 'avatar', md_text, flags=re.IGNORECASE)

    # 3. 'Optional' to 'Mandatory' for ACE
    md_text = md_text.replace(
        'Optional (API key required)',
        'Mandatory (API key required)'
    )

    # 4. n=10 to n=15
    md_text = md_text.replace('n=10', 'n=15')
    md_text = md_text.replace('n_results=10', 'n_results=15')

    # Convert to HTML
    html_content = markdown.markdown(md_text, extensions=['tables', 'fenced_code'])
    soup = BeautifulSoup(html_content, 'html.parser')

    # Bold keywords in paragraphs
    keywords = ['LLaMA-3 70B', 'GPT-4o-mini', 'ChromaDB', 'Face-API.js', 'MediaPipe', 'Whisper']
    for p in soup.find_all('p'):
        text = str(p)
        changed = False
        for kw in keywords:
            if kw in text and f'<strong>{kw}</strong>' not in text and f'<b>{kw}</b>' not in text:
                text = text.replace(kw, f'<strong>{kw}</strong>')
                changed = True
        if changed:
            new_p = BeautifulSoup(text, 'html.parser').find('p')
            p.replace_with(new_p)

    # Find Code blocks (mostly mermaid in the thesis) and replace with div.mermaid
    for pre in soup.find_all('pre'):
        code = pre.find('code')
        if code and ('language-mermaid' in code.get('class', []) or 'mermaid' in code.text):
            mermaid_code = code.get_text()
            mermaid_div = soup.new_tag('div')
            mermaid_div['class'] = 'mermaid-container'
            mermaid_div['style'] = "height: 400px; overflow: hidden; display: flex; justify-content: center; align-items: center; background: white; border: 1px solid #ccc; margin-bottom: 20px;"
            m_code = soup.new_tag('div')
            m_code['class'] = 'mermaid'
            m_code.string = mermaid_code
            mermaid_div.append(m_code)
            pre.replace_with(mermaid_div)

    # Add the other specific code snippets the user wanted fixed!
    snippets_to_fix = {
        "4.2 Cognitive Engine Design (The 'Brain')": """def process_input(input_data, provider="auto"):
    global conversation_history
    text     = input_data.get('text', '')
    emotion  = input_data.get('emotion', 'neutral')
    face_emotion = input_data.get('face_emotion', 'neutral')

    if text: text = filter_bad_words(text)
    
    # Emotion priority weights
    a = (emotion or 'neutral').lower()
    f = (face_emotion or 'neutral').lower()

    if a == f: final_emotion = a
    elif a == 'neutral' and f != 'neutral': final_emotion = f
    else: final_emotion = a

    print(f"Fused Emotion: {final_emotion}")""",
        
        "5.4.1 Avatar Animation Controller": """playAnimation(name, loopOnce = false) {
  const action = this.actions[name];
  const currentName = this.currentAnimName;
  if (!action || name === currentName) return;

  // Store active continuous loop as default idle
  if (!loopOnce) {
    this.defaultIdleAnimation = name;
  }
  
  if (this.currentAnimName && this.actions[this.currentAnimName]) {
    this.actions[this.currentAnimName].fadeOut(0.5);
  }

  action.reset().fadeIn(0.5).play();
  this.currentAnimName = name;
}"""
    }

    # Inject the snippets into the relevant sections
    for header, snippet in snippets_to_fix.items():
        h3 = soup.find('h3', string=lambda t: t and header in t)
        if h3:
            cb = soup.new_tag('pre')
            c = soup.new_tag('code', **{'class': 'language-javascript' if 'playAnimation' in snippet else 'language-python'})
            c.string = snippet
            cb.append(c)
            h3.insert_after(cb)

    # --- Strict A4 Pagination Logic ---
    MAX_HEIGHT = 800  # Conservative height limit to strictly prevent overflow
    elements = list(soup.body.contents) if soup.body else list(soup.contents)
    
    new_pages = []
    current_page = []
    current_height = 0
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
            
        has_chap_1 = any(el.name == 'h1' and 'CHAPTER 1' in el.get_text().upper() for el in current_page if el.name)
        if has_chap_1:
            in_front_matter = False
            
        page_num_div = soup.new_tag('div')
        page_num_div['class'] = 'page-num'
            
        if in_front_matter:
            roman = ['i','ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii','xiii','xiv','xv', 'xvi', 'xvii', 'xviii']
            page_num_div.string = roman[front_matter_page_num - 1] if front_matter_page_num <= len(roman) else str(front_matter_page_num)
            front_matter_page_num += 1
        else:
            page_num_div.string = str(main_page_num)
            main_page_num += 1
            
        page_div.append(page_num_div)
        new_pages.append(page_div)
        current_page = []
        current_height = 0

    for el in elements:
        if isinstance(el, str) and not el.strip():
            continue
            
        h = 0
        if el.name:
            if el.name in ['h1', 'h2']: h = 70
            elif el.name == 'h3': h = 45
            elif el.name == 'hr': h = 30
            elif el.name == 'p':
                lines = max(1, len(el.get_text()) // 90)
                h = lines * 22 + 15
            elif el.name in ['ul', 'ol']:
                items = len(el.find_all('li'))
                h = items * 26 + 20
            elif el.name == 'table':
                rows = len(el.find_all('tr'))
                h = rows * 35 + 40
            elif el.name == 'div' and 'mermaid-container' in el.get('class', []):
                h = 420  # Fixed explicit height
            elif el.name == 'pre':
                lines = len(el.get_text().split('\\n'))
                h = lines * 18 + 40
            else:
                h = 30
                
            # Avoid orphans (push heading to next page if too close to bottom)
            if el.name in ['h1', 'h2', 'h3'] and current_height + h > MAX_HEIGHT - 60:
                finish_page()
                
            # Hard page breaks for Main Chapters
            if el.name == 'h1' and 'CHAPTER' in el.get_text().upper() and current_height > 100:
                finish_page()
                
            if current_height + h > MAX_HEIGHT and current_height > 100:
                finish_page()
                
            current_page.append(el)
            current_height += h
        else:
            current_page.append(el)
            
    finish_page()

    # --- Construct Final HTML ---
    final_soup = BeautifulSoup("<!DOCTYPE html><html><head></head><body></body></html>", 'html.parser')
    
    # CSS
    style = final_soup.new_tag('style')
    style.string = """
    :root { --main-font: "Times New Roman", Times, serif; }
    body { background: #e0e0e0; margin: 0; padding: 20px; font-family: var(--main-font); font-size: 12pt; line-height: 1.5; color: #000; }
    
    /* Strict A4 Box - NO overflow allowed! */
    .page {
        background: white;
        width: 210mm;
        height: 297mm;
        margin: 0 auto 20px auto;
        padding: 25mm 25mm 25mm 37.5mm;
        box-sizing: border-box;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        position: relative;
        overflow: hidden;
        page-break-after: always;
    }
    
    /* Perfect Page Numbers embedded at the bottom center */
    .page-num {
        position: absolute;
        bottom: 12mm;
        left: 0;
        width: 100%;
        text-align: center;
        font-size: 11pt;
    }
    
    h1 { font-size: 18pt; text-align: center; font-weight: bold; margin-bottom: 25px; text-transform: uppercase; }
    h2 { font-size: 15pt;  font-weight: bold; margin-top: 25px; margin-bottom: 15px; }
    h3 { font-size: 13pt; font-weight: bold; margin-top: 20px; margin-bottom: 10px; }
    p { text-align: justify; margin-bottom: 15px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 11pt; }
    th, td { border: 1px solid #000; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    ul, ol { margin-left: 20px; margin-bottom: 15px; }
    strong { font-weight: bold; }
    pre { background: #f8f9fa; border: 1px solid #ddd; padding: 15px; border-radius: 5px; font-family: monospace; font-size: 10pt; overflow-x: hidden; white-space: pre-wrap; }
    
    /* For Printing natively without shadows */
    @media print {
        body { background: none; padding: 0; }
        .page { box-shadow: none; margin: 0; height: 297mm; page-break-after: always; overflow: hidden; }
    }
    """
    final_soup.head.append(style)
    
    # Mermaid Script (loads mermaid, renders diagrams synchronously)
    merged_script = final_soup.new_tag('script', src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js")
    final_soup.head.append(merged_script)
    init_script = final_soup.new_tag('script')
    init_script.string = "document.addEventListener('DOMContentLoaded', function() { mermaid.initialize({startOnLoad:true}); });"
    final_soup.head.append(init_script)

    # Append Pages
    for p in new_pages:
        final_soup.body.append(p)
        
    with open('docs/AURA_Project_Report_v2_Final.html', 'w', encoding='utf-8') as f:
        f.write(str(final_soup))
        
    print(f"Final document fully generated! {len(new_pages)} valid A4 static pages.")

if __name__ == '__main__':
    main()
