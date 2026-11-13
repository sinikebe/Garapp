# Garapp

**Votre véhicule, pièce par pièce.**

Garapp est une application de suivi automobile qui fonctionne dans le navigateur :
historique des interventions, composants, assurance, carburant et dépenses.
Les données et les documents sont enregistrés sur l'appareil. Les exports JSON
sont autonomes ; la sauvegarde Google Drive est facultative.

[Ouvrir Garapp](https://garapp.siniverse.cc/) ·
[Retrouver les données de l’ancienne adresse](docs/legacy-pages.md)

## Fonctionnalités

- Plusieurs véhicules, fiches détaillées et documents originaux intégrés.
- Suivi des composants, repères d'entretien et vue 3D schématique.
- Contrats d'assurance, tarifs successifs et cotisations mensuelles.
- Consommation entre pleins, estimation à partir de relevés datés et prix moyen au litre.
- Statistiques, tableaux de dépenses, recherche, impression et corbeille restaurable.
- Sauvegardes JSON, fichier lié et versions Drive avec détection des conflits.
- Installation comme application et consultation hors connexion.

Le premier lancement propose un garage fictif. Les repères d'entretien et la vue 3D
décrivent les informations saisies ; ils ne constituent pas un diagnostic mécanique.
Les versions principale et de développement utilisent des garages distincts.

## Documentation

| Document | Contenu |
| --- | --- |
| [Guide d'utilisation](docs/user-guide.md) | Saisie, calculs, composants, sauvegardes et installation |
| [Format de sauvegarde](docs/backup-format.md) | Schéma JSON, migration et règles de conservation |
| [Exemple de sauvegarde](docs/examples/garage-v2.json) | Garage entièrement fictif, validé par les tests |
| [Google Drive](docs/google-drive.md) | Configuration OAuth, synchronisation et limites |
| [Développement](docs/development.md) | Architecture, vérifications et publication |
| [Ancienne adresse GitHub Pages](docs/legacy-pages.md) | Redirections et export des données conservées |
| [Contribuer](CONTRIBUTING.md) | Proposer une correction ou une évolution |

## Développement local

Node.js 22.12 ou plus récent est nécessaire pour l'outillage de publication.
Installer les versions verrouillées, puis lancer l'application :

```sh
npm ci
npm start
```

Ouvrir [localhost:4173](http://localhost:4173). Après une modification des ressources publiques :

```sh
npm run build:pwa
npm run check
```

Le service worker généré est suivi dans Git. Les contrôles vérifient les sources,
la compatibilité des sauvegardes et les tests, puis refusent un bundle hors
connexion périmé. Les procédures de CI et de publication sont décrites dans le
[guide de développement](docs/development.md).

## Données et confidentialité

Garapp utilise IndexedDB, avec un repli vers le stockage local lorsque disponible.
Un export JSON inclut les documents, les montants exacts, la corbeille et les champs
complémentaires. Les sauvegardes version 1 restent importables ; une version future
inconnue est refusée. Les copies externes restent nécessaires contre la perte de
l'appareil ou l'effacement des données du navigateur.

Le dépôt contient uniquement du code et des exemples fictifs. Les données importées,
les jetons et les exports personnels ne doivent jamais y être ajoutés.

Garapp appartient à la famille [finapps](https://github.com/sinikebe/finapp).
Les attributions des ressources et dépendances sont dans
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
