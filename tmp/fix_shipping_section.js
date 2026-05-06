const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'app', 'dashboard', 'shop', 'page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Find the exact start marker
const START_MARKER = 'const ShippingSection = (';
const start = content.indexOf(START_MARKER);
if (start === -1) { console.error('ERROR: Cannot find ShippingSection start'); process.exit(1); }

// Find the closing pattern: "\n};\n" after a reasonable distance
// We search for the pattern that closes a top-level const arrow function
// The function ends with "};\n" at column 0
let i = start + START_MARKER.length;
let depth = 0;
let foundFirstBrace = false;
while (i < content.length) {
  const ch = content[i];
  if (ch === '{') { depth++; foundFirstBrace = true; }
  else if (ch === '}') {
    depth--;
    if (foundFirstBrace && depth === 0) {
      // Check if followed by ";"
      let end = i + 1;
      if (content[end] === ';') end++;
      console.log('Found function end at char', i, 'End marker at', end);
      console.log('Snippet around end:', JSON.stringify(content.slice(i - 5, end + 10)));
      
      const oldSection = content.slice(start, end);
      console.log('Old section lines:', oldSection.split('\n').length);
      console.log('First 100 chars:', oldSection.slice(0, 100));
      console.log('Last 100 chars:', oldSection.slice(-100));
      
      const newSection = `const ShippingSection = ({ product, selectedCountry, onCountryChange }: { product: any, selectedCountry: string | null, onCountryChange: (c: string) => void }) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  try {
    const standardized = parseShippingData(product);
    if (!standardized || standardized.length === 0) {
      return <span className="text-[10px] font-black text-black uppercase tracking-tighter">Worldwide</span>;
    }

    const currentCountry = selectedCountry || standardized[0]?.country;
    const countryData = standardized.find((c: any) => c.country === currentCountry) || standardized[0];
    const priceText = parseFloat((countryData?.price || 0).toString()) === 0 ? 'FREE' : \`R \${parseFloat((countryData?.price || 0).toString()).toFixed(2)}\`;

    return (
      <div className="flex flex-col gap-1.5" ref={dropdownRef}>
        {/* All shipping countries — scrollable list, always visible */}
        <div className="flex flex-col gap-0.5 max-h-[88px] overflow-y-auto pr-0.5 custom-scrollbar-thin">
          {standardized.map((c: any, idx: number) => {
            const fee = parseFloat((c.price || 0).toString());
            const feeText = fee === 0 ? 'FREE' : \`R \${fee.toFixed(2)}\`;
            const isActive = c.country === currentCountry;
            return (
              <button
                key={idx}
                onClick={() => onCountryChange(c.country)}
                className={\`w-full flex items-center justify-between px-2 py-1 rounded-lg transition-all text-left \${
                  isActive ? 'bg-black text-white' : 'bg-black/[0.04] text-black/70 hover:bg-black/10'
                }\`}
              >
                <span className="text-[9px] font-black uppercase tracking-tight leading-none truncate">{c.country}</span>
                <span className={\`text-[8px] font-black uppercase tracking-tighter shrink-0 ml-1 \${
                  fee === 0
                    ? (isActive ? 'text-green-400' : 'text-green-600')
                    : (isActive ? 'text-white/60' : 'text-black/30')
                }\`}>
                  {feeText}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected country shipping fee */}
        <div className="flex items-center gap-1.5 ml-1">
          <span className={\`text-[10px] font-black tracking-tighter \${priceText === 'FREE' ? 'text-green-600' : 'text-black'}\`}>
            {priceText}
          </span>
          {priceText !== 'FREE' && (
            <>
              <div className="w-1 h-1 rounded-full bg-black/10" />
              <span className="text-[8px] font-bold text-black uppercase">Shipping Fee</span>
            </>
          )}
        </div>
      </div>
    );
  } catch (e) {
    console.error('ShippingSection error:', e);
    return <span className="text-[10px] font-black text-black uppercase tracking-tighter">Worldwide</span>;
  }
};`;

      const newContent = content.slice(0, start) + newSection + '\n' + content.slice(end).replace(/^\n/, '');
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log('OK: ShippingSection replaced. New file length:', newContent.length);
      process.exit(0);
    }
  }
  i++;
}
console.error('ERROR: Could not find matching brace');
process.exit(1);
