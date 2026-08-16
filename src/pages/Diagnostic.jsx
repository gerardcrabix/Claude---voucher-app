import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { infosEnvironnement, obtenirJournal, sAbonner, viderJournal } from '../diagnostic/journal.js';

// Écran TEMPORAIRE, pour diagnostiquer un souci reproductible uniquement
// sur un vrai téléphone (Safari/WebKit ancien, réseau faible…) sans accès
// aux outils de développement. À retirer une fois le problème en cause
// identifié et corrigé durablement.
export default function Diagnostic() {
  const [journal, setJournal] = useState(obtenirJournal());
  const [copie, setCopie] = useState(false);
  const env = infosEnvironnement();

  useEffect(() => sAbonner(setJournal), []);

  function texteComplet() {
    const lignesEnv = Object.entries(env)
      .map(([cle, val]) => `${cle}: ${val}`)
      .join('\n');
    const lignesJournal = journal.length === 0
      ? '(journal vide)'
      : journal
          .map((e) => `[${e.horodatage}] (${e.niveau}) ${e.message}${e.pile ? `\n${e.pile}` : ''}`)
          .join('\n\n');
    return `--- Environnement ---\n${lignesEnv}\n\n--- Journal ---\n${lignesJournal}`;
  }

  async function copier() {
    try {
      await navigator.clipboard.writeText(texteComplet());
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      // Certains navigateurs refusent l'accès au presse-papiers hors HTTPS
      // ou hors interaction directe — le texte reste sélectionnable à la
      // main dans ce cas, le bouton échoue juste silencieusement côté copie.
    }
  }

  return (
    <div className="contenu">
      <Link to="/" className="bouton-discret">← Retour</Link>
      <h1>Diagnostic (temporaire)</h1>
      <p className="texte-discret">
        Écran de dépannage : à copier-coller quand quelque chose plante pour comprendre
        pourquoi, sans avoir besoin d'outils de développement branchés sur le téléphone.
      </p>

      <div className="actions">
        <button className="bouton-grand bouton-principal" onClick={copier}>
          {copie ? 'Copié ✓' : 'Copier tout'}
        </button>
        <button className="bouton-grand bouton-danger" onClick={viderJournal}>
          Vider le journal
        </button>
      </div>

      <div>
        <h2>Environnement</h2>
        <pre className="bloc-diagnostic">
          {Object.entries(env).map(([cle, val]) => `${cle}: ${val}`).join('\n')}
        </pre>
      </div>

      <div>
        <h2>Journal ({journal.length})</h2>
        {journal.length === 0 ? (
          <p className="texte-discret">
            Rien enregistré pour l'instant. Reproduisez le problème (ex. choisir le PDF qui
            échoue), puis revenez sur cet écran.
          </p>
        ) : (
          <pre className="bloc-diagnostic">
            {journal
              .map((e) => `[${e.horodatage}] (${e.niveau}) ${e.message}${e.pile ? `\n${e.pile}` : ''}`)
              .join('\n\n')}
          </pre>
        )}
      </div>
    </div>
  );
}
