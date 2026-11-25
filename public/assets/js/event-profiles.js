/** Presentation only: stored record types and historical values stay unchanged. */
const profiles = {
  fuel: { icon: 'fuel', title: 'Ravitaillement', date: 'Date du ravitaillement', amount: 'Montant payé (€)', help: 'Renseignez les litres ajoutés et le remplissage dans la rubrique carburant.' },
  revision: { icon: 'wrench', maintenance: true, title: 'Travaux de révision', example: 'Ex. Vidange et filtres', date: 'Date de la révision', amount: 'Montant de la révision (€)', help: 'Renseignez les travaux et le montant payé. La ventilation et les composants sont facultatifs.' },
  entretien: { icon: 'parts', maintenance: true, title: 'Entretien réalisé', example: 'Ex. Remplacement des pneus', date: 'Date de l’entretien', amount: 'Montant de l’entretien (€)', help: 'Décrivez l’entretien. Précisez les composants renouvelés dans le détail si vous souhaitez actualiser leur suivi.' },
  reparation: { icon: 'wrench', maintenance: true, title: 'Réparation réalisée', example: 'Ex. Remplacement de l’alternateur', date: 'Date de la réparation', amount: 'Montant de la réparation (€)', help: 'Décrivez la réparation et son montant. Les pièces, la main-d’œuvre et les composants restent disponibles dans le détail.' },
  controle: { icon: 'check', maintenance: true, title: 'Contrôle réalisé', example: 'Ex. Contrôle technique', date: 'Date du contrôle', amount: 'Coût du contrôle (€)', help: 'Indiquez le contrôle et son coût éventuel. Les composants observés peuvent être précisés sans les déclarer remplacés.' },
  acquisition: { icon: 'keys', title: 'Achat ou cession', example: 'Ex. Achat du véhicule', date: 'Date de l’achat ou de la cession', amount: 'Montant de la transaction (€)', help: 'Indiquez s’il s’agit d’un achat ou d’une cession dans l’intitulé. Le contrat ou le justificatif peut être joint dans les options.' },
  registration: { icon: 'document', title: 'Intitulé de l’événement', defaultTitle: 'Mise en circulation', date: 'Date de mise en circulation', amount: 'Frais éventuels (€)', help: 'La date est l’information principale. Le compteur et les frais restent facultatifs.' },
  plan: { icon: 'clock', maintenance: true, title: 'Programme d’entretien', example: 'Ex. Entretien annuel à prévoir', date: 'Date de référence', amount: 'Budget estimé (€)', help: 'Décrivez le programme et son budget éventuel. Pour une opération future, choisissez « Prévu » dans les options : elle sera exclue des dépenses enregistrées.' },
  reading: { icon: 'gauge', title: 'Intitulé du relevé', defaultTitle: 'Relevé kilométrique', date: 'Date du relevé', amount: null, help: 'Saisissez la date et le compteur observé. Un relevé ne nécessite aucun montant ni composant.' },
  insurance: { icon: 'shield', title: 'Objet de l’assurance', example: 'Ex. Cotisation d’assurance', date: 'Date du paiement', amount: 'Montant de la cotisation (€)', help: 'Renseignez la date et le montant. Les prélèvements liés à un contrat restent synchronisés avec la rubrique Assurance.' },
  other: { icon: 'more', title: 'Événement', example: 'Ex. Dépense ou événement particulier', date: 'Date de l’événement', amount: 'Montant éventuel (€)', help: 'Décrivez l’événement. Les notes et documents sont facultatifs.' },
  unclassified: { icon: 'document', title: 'Intitulé de la fiche', example: 'Ex. Événement à identifier', date: 'Date de l’événement', amount: 'Montant éventuel (€)', help: 'Conservez les informations connues. Vous pouvez choisir un type plus précis pour cette fiche.' },
};

export function eventProfile(type) {
  const kind = Object.hasOwn(profiles, type) ? type : 'other';
  return { kind, maintenance: false, defaultTitle: '', ...profiles[kind] };
}

export function eventEditorLayout(type, { title = '', partsAmount = '', laborAmount = '', totalAmount = '', lines = [], componentIds = [], observedComponentIds = [] } = {}) {
  const profile = eventProfile(type);
  const known = (value) => value !== '' && value !== null && value !== undefined;
  const hasDetail = known(partsAmount) || known(laborAmount) || lines.length > 0 || componentIds.length > 0 || observedComponentIds.length > 0;
  return {
    profile,
    showTitle: !profile.defaultTitle || title !== profile.defaultTitle,
    showAmount: profile.amount !== null || known(totalAmount) || known(partsAmount) || known(laborAmount) || lines.length > 0,
    showDetail: profile.maintenance || hasDetail,
  };
}
