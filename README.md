# Garapp

**Votre véhicule, pièce par pièce.**

Garapp est un projet de garage numérique personnel : retrouver les interventions
sur son véhicule, comprendre l'état de ses composants et suivre ce qu'il coûte
au fil du temps.

L'application appartient à la famille **finapps**, aux côtés de
[Finapp](https://github.com/sinikebe/finapp), et reprend son identité visuelle
à partir de sa version de développement.

## Première interface

L'interface reprend les palettes, la typographie, les contrôles et trois
présentations adaptées au garage : **Horizon**, **Atelier** et **Panorama**. Sa navigation est
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
- **Statistiques** : évolution datée du compteur, écart observé, rythme annualisé
  estimé et dépenses connues dans le temps. Les périodes et le périmètre des
  dépenses sont mémorisés par véhicule. Les graphiques fonctionnent hors connexion.

Les statistiques utilisent les relevés datés de la fiche véhicule et des fiches
enregistrées. Les points suivent leurs dates réelles ; sélectionner un relevé ou
toucher la courbe affiche ses sources, qui restent consultables. Un bouton permet
d’ajouter un événement de type relevé kilométrique. Aucun relevé existant n’est
modifié par les graphiques et aucun nouveau champ n’est ajouté aux sauvegardes.
Les relevés sans date ou sans compteur, les fiches prévues et les dates futures
sont exclus de la courbe et signalés. Des valeurs différentes le même jour ou une
baisse entre deux dates conservent leurs points et empêchent le calcul d’un écart
ou d’un rythme trompeur. Le rythme annualisé nécessite au moins 30 jours entre
les relevés extrêmes et décrit cet intervalle, sans prévoir le kilométrage futur.

Les dépenses sont regroupées par mois, ou par année au-delà de 24 mois. Les
factures restent comptées une seule fois, les totaux indiqués sur les justificatifs
restent prioritaires et les calculs conservent leurs décimales. Les montants
inconnus, les sous-totaux partiels et les zéros connus sont distingués ; les
remboursements ne sont pas convertis en dépenses positives. Les tables accessibles
sous les graphiques donnent les sources et montants exacts. Une période vide ne
constitue pas une preuve d’absence de dépenses.

Les véhicules, interventions, événements, composants et lignes détaillées peuvent
être ajoutés et modifiés dans l’application. Les documents locaux peuvent être
ajoutés, renommés, décrits et téléchargés depuis les fiches. La recherche parcourt
les notes et les lignes d’intervention. Le garage s’exporte et s’importe en JSON. L’import est vérifié avant remplacement et demande d’abord le téléchargement
d’une copie du garage ouvert. L’impression/PDF et les actions rapides avec
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

La rubrique courante et les filtres utiles sont mémorisés localement par véhicule.
Une rubrique explicite dans l’URL reste prioritaire ; une adresse sans fragment
reprend la dernière rubrique valide. Les valeurs invalides utilisent des réglages
sûrs, et un stockage indisponible n’empêche pas la navigation. Ce contexte reste
séparé des sauvegardes métier et distinct entre `main` et `dev`.

Le bandeau distingue **Présentation**, **Apparence** et **Outils**. Les présentations
sont décrites dans l’espace de travail : Horizon privilégie le tableau de bord,
Atelier rapproche les cartes et Panorama centre l’espace sans imposer d’étapes.
Les menus sont exclusifs, se ferment par clic extérieur ou Échap, et rétablissent
le focus clavier. Les commandes sont recherchables et accessibles avec **⌘ / Ctrl K**.
Les palettes et icônes utilisent le socle local **finapps UI v1.0.0** ; aucun fichier
n’est chargé depuis une autre application à l’exécution.

Le **logo ouvre le menu des applications finapps**. Il relie les versions `dev`
de Finapp et de Garapp entre elles et les versions principales entre elles.
Dans Finapp, ce menu suit le choix français/anglais. Les applications conservent
leurs propres données et préférences.

La vue 3D éclatée des composants connus est accessible dans **Composants**. Elle utilise une silhouette générique et des volumes réutilisables, sans modèle de voiture à télécharger. Les palettes et le serveur de développement repris de Finapp sont
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

### Vue éclatée des composants

La présentation **Vue 3D éclatée**, dans **Composants**, propose rotation, zoom,
vues de dessus et de côté, éclatement réglable et sélection des pièces. Chaque
sélection retrouve ses fiches sources et permet de préciser sa représentation.
Le clavier et un sélecteur natif donnent aussi accès à tous les composants ; la
présentation en liste reste disponible.

- Le modèle commence sans équipement supposé. Les composants ajoutés manuellement
  et les mentions positives explicites dans les intitulés et libellés de lignes
  alimentent la vue. Un contrôle peut documenter une pièce sans remise à zéro du
  suivi de remplacement. Les types de freinage et les positions restent inconnus
  lorsqu’ils ne sont pas précisés.
- Les anciennes fiches sans liens explicites sont interprétées en lecture seule.
  Le bouton **Enregistrer et préciser** transforme un composant repéré en fiche
  éditable, avec ses liens d’observation. Aucun contenu source n’est réécrit à
  l’ouverture de la vue.
- À la saisie d’une intervention, les propositions de composants et leurs actions
  sont visibles avant enregistrement. Elles peuvent être décochées, reliées à un
  composant existant ou précisées. Le sélecteur des lignes propose aussi **Créer
  un composant…** pour les noms qui ne figurent pas dans le vocabulaire reconnu.
- Les pièces non localisées sont dessinées dans **À placer**. Les formes et les
  positions sont schématiques. Une pièce absente de la vue reste inconnue ; les
  couleurs ne représentent pas son état réel.
- Les fiches prévues, futures et celles de la corbeille ne confirment pas la
  présence. Un composant créé par les fiches cesse d’être représenté quand sa
  dernière source est mise à la corbeille ; la restauration le fait réapparaître.
  Les composants déclarés manuellement restent indépendants de ces sources.

Le rendu 3D est calculé localement avec des volumes géométriques, sans bibliothèque
ou service externe. Il reste disponible hors connexion. Pour les grandes listes,
80 composants sont dessinés à la fois ; la recherche et la sélection conservent
l’accès à tous les autres. Le [format de sauvegarde](docs/backup-format.md) décrit
les positions et les liens d’observation, conservés dans les JSON et dans Drive.

### Corbeille des interventions

L’action **Mettre à la corbeille**, dans le détail d’une fiche, conserve la fiche
complète avec ses lignes, montants exacts, liens de composants, documents et autres
informations. Elle disparaît de l’historique actif, des dépenses, des graphiques et
du suivi d’entretien. Le compteur courant du véhicule reste indépendant.

**Interventions → Corbeille** et **Outils → Corbeille des interventions** permettent
de consulter puis restaurer une fiche. Les sauvegardes JSON, fichiers liés et
versions Drive comprennent la corbeille. Aucun délai d’expiration ni nettoyage
automatique n’est appliqué. La suppression définitive demande une confirmation et
ne retire rien des copies externes déjà conservées. Une ancienne sauvegarde sans
corbeille reste importable ; seules les fiches supprimées avec cette fonction
peuvent être restaurées depuis la corbeille.

### Carburant et statistiques mensuelles

L’événement **Carburant** et l’action **Ajouter du carburant** enregistrent la
quantité ajoutée en litres, le montant payé, la date, le compteur et l’indication
de plein complet ou partiel. Une information absente reste inconnue. Les autres
informations du carburant peuvent être conservées dans un objet JSON complémentaire.
Les achats de carburant sont séparés du périmètre « Interventions » des dépenses
et inclus dans « Tous les événements ».

La vue **Statistiques** présente la consommation en L/100 km, les coûts de
carburant et les distances relevées pour chaque mois, avec un tableau et une courbe
de consommation. Les filtres de période s’appliquent à ce bilan. La courbe montre
au plus 36 mois ; le tableau conserve toute la période choisie.

- La consommation utilise deux pleins complets : somme des litres ajoutés après
  le premier plein, ajouts partiels compris, jusqu’au plein complet suivant,
  divisée par la différence des compteurs, puis multipliée par 100. Le volume du
  premier plein sert de point de départ et ne s’ajoute pas au cycle. Les moyennes
  sont pondérées par les distances et supposent que tous les ajouts ont été saisis.
- Les achats suivent leur date. Un cycle de consommation est rattaché au mois
  du plein final. Les distances entre relevés datés, issus de toutes les fiches
  actives et du véhicule, sont rattachées au mois du relevé final. Les distances
  ne sont pas réparties artificiellement entre les mois : sans relevés aux
  limites de mois, ce bilan ne garantit pas une distance calendaire complète.
- Les compteurs incohérents ou manquants interrompent les calculs concernés.
  Un ajout carburant sans date empêche de vérifier l’ordre des pleins ; la
  consommation reste inconnue tant que ces dates ne sont pas complétées. Les
  coûts inconnus ne deviennent pas zéro. Les fiches prévues, futures ou dans la
  corbeille sont exclues.

### Sauvegardes par fichiers

**Outils → Gérer les sauvegardes** regroupe les copies JSON, le suivi du dernier
export et la liaison facultative à un fichier. Un raccourci dans le pied de page
indique si des modifications ont eu lieu depuis le dernier export ou si un fichier
lié reste à actualiser. L’enregistrement local et la copie externe sont distingués.

- Chaque copie téléchargée reçoit un nom unique horodaté en UTC. Les noms
  distinguent les versions de développement et les copies précédant un import.
  Le navigateur ne confirme pas la conservation d’un téléchargement : l’interface
  indique une demande d’export et invite à vérifier le fichier.
- Dans les navigateurs proposant les sélecteurs de fichiers en lecture/écriture,
  un fichier JSON peut être créé et lié au garage. Un fichier déjà rempli est
  refusé à la création ; il doit être ouvert et vérifié avant import. La liaison
  reste mémorisée dans IndexedDB si le navigateur le permet, séparément du JSON.
- Une mise à jour explicite demande l’autorisation nécessaire, vérifie l’empreinte
  SHA-256 du fichier avant écriture et après obtention du flux, puis relit le
  résultat après fermeture. Une différence externe détectée bloque l’écrasement.
  Web Locks sérialise les écritures provenant de Garapp sur une même origine ;
  cela ne constitue pas un verrou distribué entre appareils ou logiciels.
- L’écriture automatique est facultative et doit être activée à chaque ouverture
  de page. Elle intervient après une modification enregistrée localement et une
  courte pause. Elle est suspendue en cas d’erreur, de conflit local ou externe,
  d’import ou de changement de fichier. Elle ne fonctionne pas navigateur fermé.
  Une écriture en cours ou en attente déclenche la protection de sortie du navigateur.
- Avant import, un tableau compare le garage ouvert et le fichier : véhicules,
  fiches, composants, lignes et documents. Les noms des véhicules sont affichés.
  Le contenu d’un fichier lié est revérifié avant confirmation. L’import ordinaire
  détache l’ancien fichier ; ouvrir un fichier existant le lie après import réussi,
  avec l’écriture automatique désactivée.

Pour travailler sur un autre appareil avec les fichiers seuls, transférer puis importer
le dernier fichier avant de poursuivre. Ces copies ne sont pas fusionnées automatiquement.
Conserver plusieurs copies datées, dont une sur un autre support, permet de récupérer
un état antérieur et de résister à la perte du navigateur ou de l’appareil.
Le format portable reste en version 2 et inclut toujours les documents et les champs
complémentaires. Ces sauvegardes restent disponibles sans service distant ni compte.

## Synchronisation Google Drive facultative

**Outils → Gérer les sauvegardes → Synchroniser avec Google Drive** propose une
connexion explicite au compte Google, puis la création ou la sélection d’un dossier
Garapp privé. Chaque version est un JSON autonome au format 2, documents inclus.
L’application crée de nouveaux fichiers et ne modifie ni ne supprime les précédents.
La version dev, main et chaque origine de développement ont des espaces distincts.

La synchronisation automatique, activée explicitement pour le dossier, vérifie les
versions toutes les 15 secondes pendant que l’application est visible et connectée,
au retour dans l’application et après une modification enregistrée. Elle s’arrête
avec la fermeture de la page ou l’expiration du jeton Google ; une reconnexion par
bouton est nécessaire. Il s’agit de contrôles périodiques, sans serveur de notification.
Les accès OAuth restent uniquement en mémoire. Le droit `drive.file` limite l’accès
aux fichiers autorisés à l’application. Aucun secret client n’est utilisé.

Deux modifications concurrentes produisent des branches conservées. Une comparaison
permet de choisir le garage complet à poursuivre, après archivage de la copie locale.
Aucune fusion de champs n’est tentée. Une erreur de quota, de réseau, d’intégrité ou
d’enregistrement local laisse les copies précédentes disponibles et ne confirme pas
une synchronisation réussie. L’ouverture d’un fichier à importer suspend l’automatisme.
Les révisions sont complètes, sans déduplication des pièces jointes ni nettoyage
automatique ; leur taille compte dans le quota Drive. Garapp n’ajoute pas de chiffrement
au contenu privé stocké dans Drive. Une copie externe reste utile.

L’activation nécessite un client OAuth Web Google configuré par le déploiement.
Les identifiants publics sont déclarés dans `public/assets/js/drive-config.js` ; ils
sont vides par défaut. Ce réglage est effectué une seule fois pour Garapp : les
utilisateurs disposent ensuite d’un seul bouton **Se connecter à Google Drive**,
puis des étapes demandées par Google. Le panneau prépare la bibliothèque à son
ouverture sans ouvrir de connexion automatiquement. Tant que le client commun
manque, la version dev accepte aussi un réglage local d’essai dans le panneau.
Le mode opératoire et les limites sont décrits dans
[docs/google-drive.md](docs/google-drive.md).

## Installation et accès hors connexion

**Outils → Installation, hors connexion et mises à jour**, ou **Installer Garapp**
dans le pied de page, ouvre les options d’installation. Lorsqu’un navigateur propose
l’installation directe, le panneau affiche son bouton. Les instructions restent
disponibles pour Android, Safari sur iPhone/iPad et Chrome/Edge sur ordinateur.
L’application peut s’ouvrir dans une fenêtre autonome avec une icône dédiée ; les
icônes 192/512 px, une variante maskable et l’icône Apple 180 px sont livrées localement.

La première ouverture connectée prépare les fichiers publics de l’application.
Le panneau confirme lorsque Garapp peut être rouvert sans connexion. Le garage et
les documents déjà enregistrés restent dans IndexedDB, hors du cache de l’application.
Les données ne sont pas intégrées au service worker. Elles restent locales sauf
envoi explicite vers Google Drive ou activation de sa synchronisation automatique.
Une préparation échouée peut être relancée depuis le panneau. Une copie JSON externe
reste nécessaire pour résister à la suppression des données du navigateur ou à la
perte de l’appareil ; une installation seule sur un autre appareil ne synchronise pas le garage.

Chaque génération hors connexion porte les empreintes SHA-256 de ses fichiers.
Une réponse périmée, incomplète ou provenant d’une autre version fait échouer la
préparation sans remplacer la génération existante. Les ressources sont téléchargées
avec une URL propre à la génération pour éviter les anciennes réponses d’un cache HTTP.
Le service worker ne met en cache que les ressources publiques prévues ; les exports,
les données métier et les autres applications ne sont pas interceptés.

Une nouvelle version est proposée dans un bandeau. Son activation et le rechargement
nécessitent une action explicite. Les formulaires ouverts, imports, conflits locaux et
écritures en cours empêchent ce rechargement ; l’état est vérifié à nouveau lorsque
la nouvelle version prend le contrôle. Une activation depuis un autre onglet ne force
pas le rechargement des autres pages.

Les manifestes utilisent `start_url: "./"` et `scope: "./"`. L’identité est déduite de
cette adresse de départ, conformément au format des manifestes. Le chemin de publication
différent distingue donc les installations principale et de développement, et le nom
**Garapp dev** identifie cette dernière. Les caches sont également limités à leur chemin.

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
Le service worker limite sa portée et le nettoyage de ses caches à sa version publiée.
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

Après toute modification de `public/` ou du modèle du service worker, régénérer
le fichier hors connexion avant de lancer les tests et de committer :

```sh
npm run build:pwa
npm test
```

`tools/build-pwa.mjs` produit `public/sw.js` à partir du modèle et des fichiers
publics. Ce fichier généré est suivi par Git pour que la publication statique le
copie sans dépendance de compilation. Les tests refusent un fichier généré périmé.
Le serveur local calcule cette version en mémoire à chaque requête du service worker,
afin que les changements locaux puissent être détectés sans modification manuelle
d’un numéro de cache. Les icônes PNG sont dérivées du favicon SVG du projet et sont
livrées déjà rendues ; aucune bibliothèque d’image n’est nécessaire à l’exécution.

Python 3.10 ou plus récent est utilisé pour assembler les fichiers de publication :

```sh
python3 scripts/prepare_pages.py --source . --output /tmp/garapp-preview --branch dev
```

Le dossier de sortie doit être nouveau. La CI assemble les deux branches dans
un même site avec `main` à la racine et `dev` sous `/dev/`.
