// Logique pure d'analyse de texte, séparée du chargement de pdfjs-dist pour
// pouvoir être testée indépendamment du bundler/navigateur.
const MOIS_FR = {
  janvier: '01', février: '02', fevrier: '02', mars: '03', avril: '04',
  mai: '05', juin: '06', juillet: '07', août: '08', aout: '08',
  septembre: '09', octobre: '10', novembre: '11', décembre: '12', decembre: '12',
};

const TOLERANCE_MEME_LIGNE = 3; // points PDF

// Regroupe les fragments de texte positionnés (items pdf.js avec .str et
// .transform) en lignes visuelles, triées haut → bas puis gauche → droite,
// au lieu de l'ordre brut (souvent trompeur) du flux interne du PDF.
export function construireLignes(items) {
  // Ne filtre que les fragments réellement vides — pas ceux qui ne sont
  // qu'un espace (it.str.trim() !== '' les aurait aussi éliminés) : un
  // fragment espace à part entière porte l'espacement réel entre les mots
  // sur les PDF à police composite (voir lecteurPdfMinimal.js), il doit
  // survivre jusqu'à assemblerLigne().
  const utiles = items.filter((it) => it.str !== '');
  const tries = [...utiles].sort((a, b) => b.transform[5] - a.transform[5]);

  const lignes = [];
  let ligneCourante = [];
  let yCourant = null;

  for (const it of tries) {
    const y = it.transform[5];
    if (yCourant === null || Math.abs(y - yCourant) <= TOLERANCE_MEME_LIGNE) {
      ligneCourante.push(it);
      yCourant = yCourant === null ? y : yCourant;
    } else {
      lignes.push(ligneCourante);
      ligneCourante = [it];
      yCourant = y;
    }
  }
  if (ligneCourante.length) lignes.push(ligneCourante);

  return lignes.map(assemblerLigne);
}

// Assemble les fragments d'une ligne en texte. Deux styles de PDF bien
// distincts ont été rencontrés sur de vrais bons d'achat :
// - Carrefour (police simple) : chaque fragment est déjà un mot/une phrase
//   entière (un seul Tj pour "Numéro de bon", un autre pour la valeur), sans
//   glyphe espace entre deux fragments qui en auraient besoin — un espace
//   entre chaque fragment reste le bon repli, comme avant.
// - Leroy Merlin / Fnac / IKEA (police composite Identity-H) : chaque
//   caractère est dessiné par son propre Tj — y compris les espaces, qui
//   sont désormais conservés comme fragments à part entière (voir
//   lecteurPdfMinimal.js). Ici, coller les fragments sans rien rajouter
//   restitue le texte exact ; ajouter un espace entre chaque fragment comme
//   pour Carrefour donnerait "U n e" au lieu de "Une".
function assemblerLigne(ligneItems) {
  const tries = [...ligneItems].sort((a, b) => a.transform[4] - b.transform[4]);
  const courts = tries.filter((it) => it.str.length <= 1).length;
  const granulariteParCaractere = tries.length >= 4 && courts / tries.length > 0.7;

  const texte = granulariteParCaractere
    ? tries.map((it) => it.str).join('')
    : tries.map((it) => it.str).join(' ');
  return texte.trim().replace(/ {2,}/g, ' ');
}

function normaliserDate(jour, mois, annee) {
  const j = jour.padStart(2, '0');
  const a = annee.length === 2 ? `20${annee}` : annee;
  return `${a}-${mois.padStart(2, '0')}-${j}`;
}

const RE_DATE_NUMERIQUE = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/;
const RE_DATE_LITTERALE = /(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})/i;

function dateDansLigne(ligne) {
  const mNum = ligne.match(RE_DATE_NUMERIQUE);
  if (mNum) return normaliserDate(mNum[1], mNum[2], mNum[3]);
  const mLit = ligne.match(RE_DATE_LITTERALE);
  if (mLit) return normaliserDate(mLit[1], MOIS_FR[mLit[2].toLowerCase()], mLit[3]);
  return null;
}

// Cherche une valeur associée à un libellé : sur la même ligne d'abord (ex.
// "PIN : 3682"), sinon dans les quelques lignes qui suivent (ex. "Date de
// fin de validité :" puis "27/04/2027" juste en dessous). La fenêtre de
// recherche va au-delà de la toute prochaine ligne car sur un gabarit à
// deux colonnes (mentions légales à gauche, libellés/valeurs à droite), une
// ligne de texte sans rapport peut se glisser entre le libellé et sa valeur
// une fois toutes les lignes triées par position verticale — un vrai cas
// rencontré sur un bon Carrefour réel.
const FENETRE_RECHERCHE_VALEUR = 4;

function valeurApresLibelle(lignes, motifLibelle, extraireValeur) {
  for (let i = 0; i < lignes.length; i++) {
    if (!motifLibelle.test(lignes[i])) continue;
    const surLaMemeLigne = extraireValeur(lignes[i]);
    if (surLaMemeLigne) return surLaMemeLigne;
    for (let j = i + 1; j < Math.min(i + 1 + FENETRE_RECHERCHE_VALEUR, lignes.length); j++) {
      // Une vraie ligne de valeur est courte (juste le numéro/la date/le
      // PIN) — ça évite de capturer un mot qui matche par coïncidence au
      // milieu d'un paragraphe de mentions légales sans rapport.
      if (lignes[j].length > 60) continue;
      const valeur = extraireValeur(lignes[j]);
      if (valeur) return valeur;
    }
  }
  return null;
}

export function chercherDateExpiration(lignes) {
  const motsCles = /(date de fin de validit[ée]|expir|valable jusqu|validit[ée])/i;
  const trouvee = valeurApresLibelle(lignes, motsCles, dateDansLigne);
  if (trouvee) return trouvee;
  for (const ligne of lignes) {
    const d = dateDansLigne(ligne);
    if (d) return d;
  }
  return null;
}

const RE_CODE_LIBELLE = /num[ée]ro de carte|code\s*(?:promo|bon|voucher)?\s*:|r[ée]f[ée]rence/i;
const RE_CODE_VALEUR = /\b([A-Z0-9][A-Z0-9-]{4,29})\b/;

export function chercherCode(lignes) {
  return valeurApresLibelle(lignes, RE_CODE_LIBELLE, (ligne) => {
    // Retire le libellé avant de chercher la valeur, pour ne pas capturer un
    // mot du libellé lui-même (ex. "CARTE" dans "Numéro de carte").
    const sansLibelle = ligne.replace(RE_CODE_LIBELLE, '');
    const m = sansLibelle.match(RE_CODE_VALEUR);
    return m ? m[1].toUpperCase() : null;
  });
}

const RE_PIN_LIBELLE = /\bpin\b|code confidentiel|num[ée]ro confidentiel/i;
const RE_PIN_VALEUR = /\b(\d{4,8})\b/;

export function chercherPin(lignes) {
  return valeurApresLibelle(lignes, RE_PIN_LIBELLE, (ligne) => {
    const m = ligne.match(RE_PIN_VALEUR);
    return m ? m[1] : null;
  });
}

// Montant du bon : sur les 4 modèles réels rencontrés (Carrefour, Leroy
// Merlin, Fnac, IKEA), il n'est jamais précédé d'un libellé explicite —
// c'est une ligne à lui seul, ex. "50,00 €" ou "50.00 " (Carrefour, avec un
// point). D'où une reconnaissance différente des autres champs : la ligne
// entière doit correspondre exactement (ancrée ^…$) pour ne jamais
// capturer un montant qui apparaîtrait au hasard au milieu d'une phrase de
// mentions légales (ex. "…dans la limite de 3000€…").
const RE_MONTANT_LIGNE = /^(\d{1,4})[,.](\d{2})\s*€?$/;

export function chercherMontant(lignes) {
  for (const ligne of lignes) {
    const m = ligne.trim().match(RE_MONTANT_LIGNE);
    if (m) return `${m[1]},${m[2]}`;
  }
  return null;
}
