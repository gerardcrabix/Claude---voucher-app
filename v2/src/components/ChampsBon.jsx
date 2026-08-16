// Champs communs aux formulaires de création et de modification d'un bon,
// pour éviter de dupliquer le même formulaire à deux endroits.
export default function ChampsBon({
  enseignes,
  enseigneNom,
  setEnseigneNom,
  montant,
  setMontant,
  dateAchat,
  setDateAchat,
  dateExpiration,
  setDateExpiration,
  code,
  setCode,
  pin,
  setPin,
  apresEnseigne = null,
}) {
  return (
    <>
      <div className="champ">
        <label htmlFor="enseigne">Enseigne</label>
        {enseignes.length > 0 && (
          <div className="boutons-enseignes">
            {enseignes.map((e) => (
              <button
                key={e.id}
                type="button"
                className={
                  'bouton-enseigne'
                  + (enseigneNom.trim().toLowerCase() === e.nom.toLowerCase() ? ' active' : '')
                }
                onClick={() => setEnseigneNom(e.nom)}
              >
                {e.nom}
              </button>
            ))}
          </div>
        )}
        <input
          id="enseigne"
          type="text"
          placeholder="ex. Boursobank"
          value={enseigneNom}
          onChange={(e) => setEnseigneNom(e.target.value)}
        />
        <span className="aide">
          {enseignes.length > 0 ? 'Cliquez une enseigne ci-dessus, ou tapez-en une nouvelle.' : 'Nouvelle enseigne ? Tapez simplement son nom.'}
        </span>
      </div>

      {apresEnseigne}

      <div className="champ">
        <label htmlFor="montant">Montant du bon</label>
        <input
          id="montant"
          type="text"
          inputMode="decimal"
          placeholder="0,00"
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
        />
      </div>

      <div className="champ">
        <label htmlFor="date-achat">Date d'achat</label>
        <input
          id="date-achat"
          type="date"
          value={dateAchat}
          onChange={(e) => setDateAchat(e.target.value)}
        />
      </div>

      <div className="champ">
        <label htmlFor="date-expiration">Date d'expiration (optionnel)</label>
        <input
          id="date-expiration"
          type="date"
          value={dateExpiration}
          onChange={(e) => setDateExpiration(e.target.value)}
        />
      </div>

      <div className="champ">
        <label htmlFor="code">Code du bon</label>
        <input
          id="code"
          type="text"
          placeholder="ex. ABCD-1234"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>

      <div className="champ">
        <label htmlFor="pin">PIN / code confidentiel (optionnel)</label>
        <input
          id="pin"
          type="text"
          inputMode="numeric"
          placeholder="ex. 4821"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
      </div>
    </>
  );
}
