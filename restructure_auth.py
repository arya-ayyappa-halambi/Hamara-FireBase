import sys

with open('/Users/aryaayyappahalambi/Desktop/flarebase/public/index.html', 'r') as f:
    content = f.read()

# Grab the whole auth-screen block
start_idx = content.find('<div id="auth-screen"')
end_idx = content.find('<!-- ========================================== -->', start_idx)

auth_block = content[start_idx:end_idx]

# Extract the login form inner content (everything inside the left wrapper)
left_start = auth_block.find('<!-- Glow background for the left panel -->')
left_end = auth_block.find('<!-- RIGHT SIDE: Interactive Carousel -->')
login_form_content = auth_block[left_start:left_end].strip()
# trim the last two closing divs of the old left side wrapper
login_form_content = login_form_content.rsplit('</div>', 2)[0].strip() + '\n      </div>\n    </div>'

# Extract the slides
slides = []
for i in range(5):
    slide_start = auth_block.find(f'<!-- Slide {i} -->')
    slide_end = auth_block.find(f'<!-- Slide {i+1} -->' if i < 4 else '</div>\n\n      <script>')
    slides.append(auth_block[slide_start:slide_end])

# Rebuild the auth block
new_auth_block = f'''<div id="auth-screen" class="fixed inset-0 z-50 w-full h-screen bg-[#090d16] overflow-hidden">

  <!-- BACKGROUND CAROUSEL (Spans Full Screen) -->
  <div id="flarebase-carousel" class="absolute inset-0 hidden lg:block z-0 pointer-events-none">
'''

for idx, slide in enumerate(slides):
    # Extract the img source
    img_start = slide.find('<img src="') + 10
    img_end = slide.find('"', img_start)
    img_src = slide[img_start:img_end]
    
    # Extract the top badge and text card
    card_start = slide.find('<div class="flex justify-end w-full">')
    card_end = slide.find('<!-- Slide') if '<!-- Slide' in slide[card_start:] else slide.rfind('</div>', 0, slide.rfind('</div>'))
    
    # Actually just grab from <div class="flex justify-end w-full"> to the end of the flex-col div
    # It's easier to just split by <div class="absolute inset-0 flex flex-col p-10 md:p-14 z-20">
    parts = slide.split('<div class="absolute inset-0 flex flex-col p-10 md:p-14 z-20">')
    inner_card_content = parts[1].rsplit('</div>\n        </div>', 1)[0].strip()
    # Wait, the end of the slide might just have two closing divs.
    inner_card_content = parts[1].strip()
    while inner_card_content.endswith('</div>'):
        inner_card_content = inner_card_content[:-6].strip()
    # add back one closing div for the flex flex-col container
    inner_card_content += '\n          </div>'
    
    new_auth_block += f'''    <!-- Slide {idx} -->
    <div class="carousel-slide absolute inset-0 transition-opacity duration-1000 ease-in-out {'opacity-100 z-10' if idx == 0 else 'opacity-0 z-0'}">
      <img src="{img_src}" class="w-full h-full object-cover opacity-60 mix-blend-overlay" />
      <div class="absolute inset-0 bg-gradient-to-r from-[#090d16] via-[#090d16]/90 to-[#090d16]/30 pointer-events-none z-10"></div>
      
      <div class="absolute inset-0 flex">
        <div class="w-1/2"></div>
        <div class="w-1/2 flex flex-col p-10 md:p-14 z-20 pointer-events-auto">
          {inner_card_content}
        </div>
      </div>
    </div>
'''

new_auth_block += '''  </div>

  <!-- FOREGROUND SPLIT -->
  <div class="relative z-10 flex w-full h-full pointer-events-none">
    
    <!-- LEFT SIDE: Auth Form -->
    <div class="w-full lg:w-1/2 h-full flex flex-col items-center justify-center p-6 sm:p-12 relative pointer-events-auto bg-[#090d16] lg:bg-transparent overflow-y-auto lg:overflow-visible">
      ''' + login_form_content + '''

    <!-- RIGHT SIDE: Empty for pointer events -->
    <div class="hidden lg:block w-1/2 h-full pointer-events-none"></div>
  </div>

  <script>'''

# Get the script
script_start = auth_block.find('<script>') + 8
new_auth_block += auth_block[script_start:]

new_content = content[:start_idx] + new_auth_block + content[end_idx:]

with open('/Users/aryaayyappahalambi/Desktop/flarebase/public/index.html', 'w') as f:
    f.write(new_content)
    
print("Successfully updated index.html")
