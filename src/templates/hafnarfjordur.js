// Ticket subject/body text for hafnarfjordur (Hafnarfjarðarbær). To give a
// new customer their own wording: copy this file (renaming it, e.g.
// customerB.js), edit the text, then register it in src/templates/index.js
// and set that customer's CUSTOMER_ID var in wrangler.toml to match.
//
// [SSN], [FULL NAME], etc. are literal placeholders for now — not yet wired
// to real Kjarni record fields (see src/lib/mapping.js buildSubject/buildBody,
// which currently just return these as-is).

export const subjectTemplate = "Nýr starfsmaður - - [SSN]";

export const bodyTemplate = `Eftirfarandi starfsmaður hefur verið ráðinn til Hafnarfjarðarbæjar og verið stofnaður í nýju starfi í Kjarna.
 •\tNafn: [FULL NAME]
 •\tKennitala: [SSN]
 •\tSvið: [TEXT]
 •\tDeild: [DEPARTMENT]
 •\tStaða: [POSITION]
 •\tTegund ráðningar: [TYPE OF EMPLOYMENT]
 •\tYfirmaður: [SUPERVISOR]
 •\tFyrsti starfsdagur: [FIRST DAY]
 •\tSíðasti starfsdagur: [END DAY]
 •\tStarfshlufall: [EMPLOYMENT PORTION]
Til launafulltrúa, vinsamlegast yfirfarið skráningar í launa- og mannauðskerfi áður en ráðningarsamningur er útbúinn og samningur um fasta yfirvinnu og/eða akstur ef við á. ${""}

Tryggja þarf skil á viðeigandi gögnum áður en ráðningarsamningur er gerður svo sem menntunargögn til staðfestingar á námi, námsferilsyfirlit, leyfisbréf kennara og starfsvottorð til staðfestingar á starfsferli.`;
