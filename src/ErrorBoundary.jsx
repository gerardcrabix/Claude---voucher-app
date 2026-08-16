import { Component } from 'react';
import { ajouterEntree } from './diagnostic/journal.js';

// Filet de sécurité : sans ça, un plantage au rendu (n'importe quelle page)
// fait disparaître toute l'appli sans rien afficher — juste un écran blanc,
// sans indice sur ce qui s'est passé. Ça capture l'erreur, la journalise
// pour l'écran de diagnostic, et affiche un écran de secours au lieu du
// blanc silencieux.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { erreur: null };
  }

  static getDerivedStateFromError(erreur) {
    return { erreur };
  }

  componentDidCatch(erreur, info) {
    ajouterEntree('crash-rendu', erreur?.message || String(erreur), erreur?.stack || info?.componentStack);
  }

  render() {
    if (!this.state.erreur) return this.props.children;

    return (
      <div className="ecran-centre">
        <h1>Un problème est survenu</h1>
        <p className="texte-discret">
          L'écran n'a pas pu s'afficher correctement. Vos données restent intactes (elles sont
          stockées sur l'appareil, pas perdues par ce plantage).
        </p>
        <code style={{ fontSize: '0.8rem', wordBreak: 'break-word' }}>
          {this.state.erreur?.message || String(this.state.erreur)}
        </code>
        <button
          className="bouton-grand bouton-principal"
          onClick={() => {
            this.setState({ erreur: null });
            window.location.hash = '#/';
            window.location.reload();
          }}
        >
          Revenir à l'accueil
        </button>
        <a href="#/diagnostic" className="bouton-discret" onClick={() => this.setState({ erreur: null })}>
          Voir le journal détaillé
        </a>
      </div>
    );
  }
}
