// Verrou par mot de passe sur le choix d'identité (CM/AJ). Important à
// savoir : c'est un verrou local à l'appareil (comme tout le reste du
// MVP), pas une vraie authentification serveur — ça empêche un accès
// occasionnel, pas quelqu'un qui inspecterait le code du navigateur. Pour
// une vraie sécurité par compte, il faudra le backend Supabase prévu pour
// plus tard.
const CLE_STOCKAGE = 'bons-app:mots-de-passe';

const PAR_DEFAUT = {
  moi: '7275!',
  elle: '7572!',
};

function lireTout() {
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE);
    if (!brut) return { ...PAR_DEFAUT };
    const parse = JSON.parse(brut);
    return { ...PAR_DEFAUT, ...parse };
  } catch {
    return { ...PAR_DEFAUT };
  }
}

function ecrireTout(mots) {
  localStorage.setItem(CLE_STOCKAGE, JSON.stringify(mots));
}

export function verifierMotDePasse(id, saisie) {
  const mots = lireTout();
  return typeof saisie === 'string' && saisie === mots[id];
}

export function definirMotDePasse(id, nouveauMotDePasse) {
  const mots = lireTout();
  mots[id] = nouveauMotDePasse;
  ecrireTout(mots);
}
