import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  obtenirBon,
  obtenirPdf,
  enregistrerPdf,
  supprimerPdf,
  terminerBon,
  supprimerBonDefinitivement,
} from '../db/repository.js';
import { centimesVersAffichage } from '../utils/money.js';
import { formatDateAffichage, estSousLeSeuil, estExpire } from '../utils/dates.js';
import { libelleIdentite } from '../identity/IdentityContext.jsx';
import ModaleDepense from '../components/ModaleDepense.jsx';
import ModaleCorrigerSolde from '../components/ModaleCorrigerSolde.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

const LIBELLES_STATUT = {
  actif: 'Actif',
  expire: 'Expiré',
  solde: 'Solde épuisé',
  termine: 'Terminé',
};

export default function BonDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [bon, setBon] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [modale, setModale] = useState(null); // 'depenser' | 'corriger' | 'supprimer' | null

  async function charger() {
    const b = await obtenirBon(id);
    setBon(b);
    const p = await obtenirPdf(id);
    setPdf(p);
  }

  useEffect(() => {
    charger();
  }, [id]);

  useEffect(() => {
    if (!pdf) {
      setPdfUrl(null);
      return;
    }
    const url = URL.createObjectURL(pdf.blob);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pdf]);

  async function surChoixPdf(e) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    await enregistrerPdf(id, fichier);
    await charger();
  }

  async function surSuppressionPdf() {
    await supprimerPdf(id);
    await charger();
  }

  async function surTerminer() {
    await terminerBon(id);
    await charger();
  }

  async function surSuppressionDefinitive() {
    await supprimerBonDefinitivement(id);
    navigate('/');
  }

  if (!bon) {
    return <div className="contenu"><p className="texte-discret">Chargement…</p></div>;
  }

  const urgent = estSousLeSeuil(bon.dateExpiration);
  const expire = estExpire(bon.dateExpiration);

  const historique = [
    ...bon.mouvements.map((m) => ({ type: 'depense', ...m })),
    ...bon.overrides.map((o) => ({ type: 'correction', ...o })),
    ...bon.modifications.map((m) => ({ type: 'modification-montant', ...m })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div className="contenu">
      <div className="section-titre">
        <Link to="/" className="bouton-discret">← Retour</Link>
        <Link to={`/bon/${id}/modifier`} className="bouton-discret">Modifier</Link>
      </div>

      <div className="carte-bon">
        <div className="ligne-haut">
          <span className="enseigne">{bon.enseigne?.nom}</span>
          <span className="pilule-statut">{LIBELLES_STATUT[bon.statut]}</span>
        </div>
        <div className="montants-bon">
          <div className="montant-bloc">
            <span className="libelle-montant">Restant</span>
            <span className="solde">{centimesVersAffichage(bon.solde)}</span>
          </div>
          <div className="montant-bloc secondaire">
            <span className="libelle-montant">Initial</span>
            <span className="montant-secondaire">{centimesVersAffichage(bon.montantInitial)}</span>
          </div>
        </div>
        {bon.code && <span className="code" style={{ fontSize: '1.1rem' }}>{bon.code}</span>}
        {bon.pin && (
          <span className="texte-discret">PIN / code confidentiel : <strong>{bon.pin}</strong></span>
        )}
        <span className={`expiration ${urgent ? 'urgent' : ''}`}>
          {bon.dateExpiration
            ? `${expire ? 'Expiré le' : "À utiliser avant le"} ${formatDateAffichage(bon.dateExpiration)}`
            : "Pas de date d'expiration"}
        </span>
        <p className="texte-discret">Acheté le {formatDateAffichage(bon.dateAchat)}</p>
        <p className="texte-discret">Créé par {libelleIdentite(bon.createdBy)}</p>
      </div>

      <div className="actions">
        <button className="bouton-grand bouton-principal" onClick={() => setModale('depenser')}>
          Dépenser
        </button>
        <button className="bouton-grand bouton-secondaire" onClick={() => setModale('corriger')}>
          Corriger le solde
        </button>
      </div>

      <div>
        <h2>Document</h2>
        {pdf ? (
          <div className="actions">
            <a
              className="bouton-grand bouton-secondaire"
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              download={pdf.filename}
            >
              Voir le PDF
            </a>
            <button className="bouton-grand bouton-danger" onClick={surSuppressionPdf}>
              Supprimer
            </button>
          </div>
        ) : (
          <label className="bouton-grand bouton-secondaire bouton-pleine-largeur" style={{ display: 'block', textAlign: 'center' }}>
            Ajouter le PDF
            <input type="file" accept="application/pdf" onChange={surChoixPdf} style={{ display: 'none' }} />
          </label>
        )}
        {pdf && (
          <label className="bouton-discret" style={{ display: 'inline-block', marginTop: 8 }}>
            Remplacer le PDF
            <input type="file" accept="application/pdf" onChange={surChoixPdf} style={{ display: 'none' }} />
          </label>
        )}
      </div>

      <div>
        <h2>Historique</h2>
        {historique.length === 0 ? (
          <p className="texte-discret">Aucun mouvement pour l'instant.</p>
        ) : (
          <div className="liste-simple">
            {historique.map((h) => (
              <div key={h.id} className="ligne-enseigne">
                {h.type === 'depense' && (
                  <>
                    <strong>-{centimesVersAffichage(h.montant)}</strong>
                    <span className="texte-discret">
                      {formatDateAffichage(h.date)} · {libelleIdentite(h.auteur)}
                      {h.note && ` · ${h.note}`}
                    </span>
                  </>
                )}
                {h.type === 'correction' && (
                  <>
                    <strong>Solde corrigé à {centimesVersAffichage(h.nouveauSolde)}</strong>
                    <span className="texte-discret">
                      {libelleIdentite(h.auteur)}
                      {h.motif && ` · ${h.motif}`}
                    </span>
                  </>
                )}
                {h.type === 'modification-montant' && (
                  <>
                    <strong>
                      Montant initial modifié : {centimesVersAffichage(h.montantAvant)} → {centimesVersAffichage(h.montantApres)}
                    </strong>
                    <span className="texte-discret">
                      {formatDateAffichage(h.createdAt.slice(0, 10))} · {libelleIdentite(h.auteur)}
                      {' · restant après changement : '}
                      {centimesVersAffichage(h.soldeApres)}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="actions">
        {bon.statut !== 'termine' && (
          <button className="bouton-grand bouton-secondaire" onClick={surTerminer}>
            Marquer comme terminé
          </button>
        )}
        <button className="bouton-grand bouton-danger" onClick={() => setModale('supprimer')}>
          Supprimer définitivement
        </button>
      </div>

      {modale === 'depenser' && (
        <ModaleDepense
          bon={bon}
          onFermer={() => setModale(null)}
          onEnregistre={async () => {
            setModale(null);
            await charger();
          }}
        />
      )}
      {modale === 'corriger' && (
        <ModaleCorrigerSolde
          bon={bon}
          onFermer={() => setModale(null)}
          onEnregistre={async () => {
            setModale(null);
            await charger();
          }}
        />
      )}
      {modale === 'supprimer' && (
        <ConfirmDialog
          titre="Supprimer définitivement"
          message={`Cette action supprime le bon ${bon.enseigne?.nom ?? ''} et tout son historique. C'est irréversible.`}
          libelleConfirmer="Supprimer"
          onAnnuler={() => setModale(null)}
          onConfirmer={surSuppressionDefinitive}
        />
      )}
    </div>
  );
}
