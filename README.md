# Garapp

**Votre véhicule, pièce par pièce.**

Garapp est un projet de garage numérique personnel : retrouver les interventions
sur son véhicule, comprendre l'état de ses composants et suivre ce qu'il coûte
au fil du temps.

L'application appartient à la famille **finapps**, aux côtés de
[Finapp](https://github.com/sinikebe/finapp), et reprend son identité visuelle
à partir de sa version de développement.

## Première interface

L'interface reprend les palettes, la typographie, les contrôles et les trois
ambiances **Horizon**, **Atelier** et **Parcours** de Finapp. Sa navigation est
adaptée au suivi d'un véhicule :

- **Vue d'ensemble** : véhicule sélectionné, kilométrage, repères à prévoir,
  dépenses enregistrées et interventions récentes.
- **Interventions** : journal filtrable, détail des coûts, notes et liens vers
  les composants remplacés ou renouvelés.
- **Composants** : historique des remplacements et intervalles personnalisables
  en kilomètres ou en mois. Le premier intervalle atteint gouverne le repère.
- **Dépenses** : total par période, pièces, main-d'œuvre et répartition par type
  d'intervention. Une intervention liée à plusieurs composants est comptée une
  seule fois. Le carburant et l'assurance ne sont pas inclus dans ces totaux.

Les véhicules, interventions, événements, composants et lignes détaillées peuvent
être ajoutés et modifiés dans l’application. Les documents locaux peuvent être
ajoutés, renommés, décrits et téléchargés depuis les fiches. La recherche parcourt
les notes et les lignes d’intervention. Le garage s’exporte et s’importe en JSON. L'import est vérifié avant remplacement et télécharge d'abord
une copie du garage ouvert. L'impression/PDF et les actions rapides avec
**Ctrl/Cmd K** sont disponibles.

Le premier lancement propose un **garage d'exemple fictif**, clairement identifié.
Ses montants et intervalles servent à explorer l'interface, pas de préconisations
constructeur. Les repères d'entretien ne constituent pas un diagnostic de l'état
réel des pièces.

Les données et documents sont enregistrés dans IndexedDB, avec un repli vers le
stockage local historique lorsque celui-ci est disponible. Les clés sont propres
à Garapp et au chemin de publication. La version `dev` et la version principale ont des
garages distincts. Un échec d'enregistrement est affiché et la copie ouverte
reste exportable. Les écritures utilisent Web Locks lorsque le navigateur le
permet et refusent de remplacer silencieusement les données d'un autre onglet.

Le **logo ouvre le menu des applications finapps**. Il relie les versions `dev`
de Finapp et de Garapp entre elles et les versions principales entre elles.
Dans Finapp, ce menu suit le choix français/anglais. Les applications conservent
leurs propres données et préférences.

La vue 3D éclatée avec composants cliquables reste à développer. Les palettes et le serveur de développement repris de Finapp sont
attribués dans [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Données complètes et sauvegardes

Le [format JSON version 2](docs/backup-format.md) décrit les champs, les règles de
calcul et les documents embarqués. Un [exemple entièrement fictif](docs/examples/garage-v2.json)
est fourni pour les outils qui produisent une sauvegarde. Aucun accès à un service
externe n’est nécessaire pour importer ou consulter un garage.

- Les lignes d’intervention portent leurs propres libellés, descriptions, montants
  exacts, documents et liens de composants. Pièces, prestations, forfaits et frais
  restent distincts ; un contrôle ne réinitialise pas le suivi d’un remplacement.
- Les montants utilisent des chaînes décimales en euros. Le détail conserve la
  précision d’origine ; les synthèses sont arrondies aux centimes après addition.
- Dates, kilométrages, catégories et montants peuvent rester inconnus. Une valeur
  inconnue est distinguée de zéro, et les relevés contradictoires sont conservés.
- Les acquisitions, mises en circulation, programmes d’entretien et relevés ont
  leur place dans l’historique, avec un périmètre de dépenses séparé.
- Les notes, corps de fiches et champs JSON supplémentaires sont conservés dans les
  sauvegardes et peuvent être corrigés dans l’application.
- Les documents sont intégrés au JSON en base64 : les originaux restent accessibles
  sans dépendre d’un lien de téléchargement temporaire. Chaque fichier est limité
  à 64 Mio ; une sauvegarde est limitée à 512 Mio, base64 inclus.
- Les anciennes sauvegardes version 1 restent lisibles et sont mises à niveau sans
  supprimer les propriétés supplémentaires. Les versions futures inconnues sont refusées.

Un échec de stockage ou de quota est affiché ; les modifications et documents de
la copie ouverte restent exportables. Les transactions IndexedDB et les notifications
entre onglets protègent contre le remplacement silencieux d’une autre copie. Le
stockage navigateur reste local à un appareil et à un chemin de publication : les
exports sont nécessaires pour conserver une sauvegarde indépendante.

## Versions publiées

| Branche | Usage | Adresse GitHub Pages |
| --- | --- | --- |
| `main` | Version de référence | <https://sinikebe.github.io/Garapp/> |
| `dev` | Développement et validation | <https://sinikebe.github.io/Garapp/dev/> |

Ces adresses sont disponibles après activation de GitHub Pages et réussite du
premier déploiement. La branche `dev` contient la première interface ; la version de référence reste
sous le contrôle du mainteneur.

Le travail courant se fait sur `dev`. Une fusion de `dev` vers `main` publie la
version de référence.

## CI et publication

Les workflows [CI](.github/workflows/ci.yml) et
[GitHub Pages](.github/workflows/pages.yml) :

1. Vérifient la préparation du site et exécutent les tests Node sur chaque push
   sur `main` ou `dev` et sur les pull requests visant ces branches.
2. Après une CI réussie sur un push ou un lancement manuel depuis `main` ou
   `dev`, récupèrent les dernières versions de **ces deux branches**.
3. Assemblent `main` à la racine et `dev` dans le sous-dossier `dev/`, puis publient
   un seul artefact GitHub Pages.

Une pull request est vérifiée sans publication. Les publications sont
sérialisées et chaque exécution récupère les deux branches après sa mise en
attente : publier `dev` conserve la version issue de `main`, et inversement.
Une erreur de préparation interrompt la publication complète.

La publication s'exécute toujours depuis `main`, même lorsqu'un changement de
`dev` l'a déclenchée. Elle fonctionne ainsi avec un environnement `github-pages`
qui n'autorise que `main`. Les pull requests, y compris celles issues d'un fork,
ne déclenchent aucune publication.

La CI utilise les actions officielles GitHub et le `GITHUB_TOKEN` fourni par
GitHub Actions. Aucun secret personnel et aucune branche `gh-pages` ne sont
nécessaires. Les droits de publication sont limités au job de déploiement.

### Activation dans GitHub

Dans [Settings → Pages](https://github.com/sinikebe/Garapp/settings/pages),
sélectionner **GitHub Actions** comme source de publication.

Si l'environnement `github-pages` limite les branches de déploiement, autoriser
**`main`** dans
[Settings → Environments](https://github.com/sinikebe/Garapp/settings/environments).
Les deux branches doivent exister pour assembler le site.

Le workflow peut ensuite être relancé depuis
[Actions → GitHub Pages](https://github.com/sinikebe/Garapp/actions/workflows/pages.yml)
avec **Run workflow** en sélectionnant `main`, ou par un nouveau push sur `main`
ou `dev` qui passe la CI.

### Dossier publié

Le script [scripts/prepare_pages.py](scripts/prepare_pages.py) publie le contenu
de `public/` lorsqu'il existe. Ce dossier doit contenir un `index.html` non vide.
En son absence, le script génère la page d'attente. Un dossier `public/` présent
mais incomplet fait échouer la CI au lieu de masquer une erreur de livraison.

Seul le contenu de `public/` est copié : le dépôt, les scripts de CI et les
documents de travail restent hors du site publié. Les liens symboliques sont
refusés. Le nom `public/dev` est réservé à la version de développement.

Utiliser des chemins relatifs pour les ressources, par exemple `./assets/app.css`,
afin de fonctionner à la fois sous `/Garapp/` et `/Garapp/dev/`. Si un outil de
compilation est ajouté, il devra produire ce dossier avec le bon chemin de base.
Les éventuels service workers devront limiter leur portée à leur version.
Les deux versions partagent une origine GitHub Pages : les clés de stockage
local devront aussi être distinctes pour éviter de mélanger leurs données.

## Développement et vérification locale

Node 22 ou plus récent suffit pour utiliser et tester l'application, sans
installation de dépendances :

```sh
npm start
npm test
```

Ouvrir <http://localhost:4173>. `npm run dev` utilise le même serveur local.
Le site publié utilise exclusivement des chemins de ressources relatifs.

Python 3.10 ou plus récent est utilisé pour assembler les fichiers de publication :

```sh
python3 scripts/prepare_pages.py --source . --output /tmp/garapp-preview --branch dev
```

Le dossier de sortie doit être nouveau. La CI assemble les deux branches dans
un même site avec `main` à la racine et `dev` sous `/dev/`.
