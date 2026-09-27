// Bildbibliothek und Beispielprodukte (Bilder liegen in assets/products/)
export const LIBRARY = [
  { key: 'bier',        name: 'Bier',              sub: 'Falken Lager hell, Dose 5 dl',  price: 600,  cat: 'Getränke' },
  { key: 'bierflasche', name: 'Bier Flasche',      sub: 'Falken Lager hell, 3.3 dl',     price: 600,  cat: 'Getränke' },
  { key: 'mineral',     name: 'Valser prickelnd',  sub: 'Mineralwasser, 5 dl',           price: 400,  cat: 'Getränke' },
  { key: 'still',       name: 'Valser still',      sub: 'Mineralwasser, 5 dl',           price: 400,  cat: 'Getränke' },
  { key: 'cola',        name: 'Cola',              sub: 'Flasche, 5 dl',                 price: 400,  cat: 'Getränke' },
  { key: 'coladose',    name: 'Cola Dose',         sub: 'Dose, 3.3 dl',                  price: 400,  cat: 'Getränke' },
  { key: 'colazero',    name: 'Cola Zero Dose',    sub: 'Zero Zucker, Dose 3.3 dl',      price: 400,  cat: 'Getränke' },
  { key: 'rivella',     name: 'Rivella Rot',       sub: 'Flasche, 5 dl',                 price: 400,  cat: 'Getränke' },
  { key: 'vivi',        name: 'Vivi Kola',         sub: 'Schweizer Kola, 5 dl',          price: 400,  cat: 'Getränke' },
  { key: 'fanta',       name: 'Fanta Orange',      sub: 'Flasche, 5 dl',                 price: 400,  cat: 'Getränke' },
  { key: 'sprite',      name: 'Sprite Zero',       sub: 'Ohne Zucker, 5 dl',             price: 400,  cat: 'Getränke' },
  { key: 'elmer',       name: 'Elmer Citro',       sub: 'Flasche, 5 dl',                 price: 400,  cat: 'Getränke' },
  { key: 'redbull',     name: 'Red Bull',          sub: 'Dose, 2.5 dl',                  price: 500,  cat: 'Getränke' },
  { key: 'aperol',      name: 'Aperol Spritz',     sub: 'Mit Prosecco & Soda',           price: 1000, cat: 'Getränke' },
  { key: 'bratwurst',   name: 'Bratwurst',         sub: 'St. Galler mit Bürli',          price: 800,  cat: 'Essen' },
  { key: 'schweins',    name: 'Schweinsbratwurst', sub: 'Vom Grill, mit Bürli',          price: 800,  cat: 'Essen' },
  { key: 'cervelat',    name: 'Cervelat',          sub: 'Grilliert, mit Bürli & Senf',   price: 700,  cat: 'Essen' },
  { key: 'pommes',      name: 'Pommes',            sub: 'Portion, Ketchup/Mayo',         price: 700,  cat: 'Essen' },
  { key: 'burger',      name: 'Burger',            sub: 'Rind, Salat, Tomate, Zwiebeln', price: 1200, cat: 'Essen' },
  { key: 'cheese',      name: 'Cheeseburger',      sub: 'Rind, Cheddar, Gurken',         price: 1300, cat: 'Essen' },
  { key: 'hotdog',      name: 'Hotdog',            sub: 'Im Brot, mit Senf oder Ketchup', price: 900, cat: 'Essen' },
  { key: 'kartoffel',   name: 'Ofenkartoffel',     sub: 'Mit Sauerrahm & Schnittlauch',  price: 800,  cat: 'Essen' },
  { key: 'weggen',      name: 'Wurstweggen',       sub: 'Frisch aus dem Ofen',           price: 500,  cat: 'Essen' },
  { key: 'menu',        name: 'Chilbi-Menü',       sub: 'Ofenkartoffel + Wurstweggen',   price: 1200, cat: 'Essen' },
];

/** Absolute URL eines Bibliotheksbilds (funktioniert auch auf GitHub Pages in Unterordnern). */
export const libraryUrl = (key) => new URL(`assets/products/${key}.jpg`, document.baseURI).href;
