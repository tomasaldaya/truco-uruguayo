// Tanteo en grupos de cinco (Art. 94): cuadrado con diagonal
function tally(s, target){
  const groups = target/5, rows = groups/2, w = 120, cell = 22, gap = 6;
  const h = rows*(cell+gap) + 10;
  let out = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" aria-label="${s} puntos">`;
  for (let g=0; g<groups; g++){
    const r = Math.floor(g/2), c = g%2;
    const x = 18 + c*(cell+gap+20), y = 4 + r*(cell+gap) + (r>=rows/2 ? 8 : 0);
    const n = Math.max(0, Math.min(5, s - g*5));
    const L = [[x,y,x+cell,y],[x+cell,y,x+cell,y+cell],[x+cell,y+cell,x,y+cell],[x,y+cell,x,y],[x,y,x+cell,y+cell]];
    L.forEach((l,i)=>{ out += `<line x1="${l[0]}" y1="${l[1]}" x2="${l[2]}" y2="${l[3]}" stroke="${i<n?'#e8b13a':'rgba(255,255,255,.1)'}" stroke-width="${i<n?3:1.5}" stroke-linecap="round"/>`; });
  }
  const my = 4 + (rows/2)*(cell+gap);
  out += `<line x1="4" y1="${my}" x2="${w-4}" y2="${my}" stroke="rgba(255,255,255,.35)" stroke-dasharray="3 3"/>`;
  return out + '</svg>';
}
