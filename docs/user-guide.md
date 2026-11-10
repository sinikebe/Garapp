# Guide d'utilisation

[Accueil du projet](../README.md)

Garapp conserve un garage sur l'appareil utilisé. Le premier lancement propose un
exemple fictif pour découvrir les écrans. Ajouter un véhicule permet de commencer
un historique personnel. Les versions `main`, `dev` et les adresses locales utilisent
des espaces distincts ; un export/import permet un transfert explicite entre eux.

## Naviguer et saisir les informations

| Rubrique | Usage |
| --- | --- |
| Vue d'ensemble | Consulter le véhicule, ses repères et ses dernières interventions |
| Interventions | Rechercher, ajouter et modifier les fiches d'historique |
| Composants | Suivre les remplacements et les intervalles d'entretien |
| Assurance | Gérer les contrats, cotisations et changements de tarif |
| Dépenses | Consulter les montants connus par période et par type |
| Statistiques | Suivre les relevés kilométriques, dépenses et achats de carburant |

Les présentations **Horizon**, **Atelier** et **Panorama** adaptent la disposition du
garage. Le bandeau distingue la présentation, l'apparence et les outils. Le logo
ouvre le menu des applications finapps. Les liens relient les versions principales
entre elles, et les versions de développement entre elles.

Les actions rapides sont accessibles avec **Ctrl/Cmd K**. Les menus se ferment par
clic extérieur ou Échap et rendent le focus à leur commande. Les boutons d'information
donnent accès aux explications au clavier, au clic et au toucher. L'impression/PDF
est disponible dans les outils.

La rubrique et les filtres utiles sont mémorisés par véhicule. Un fragment explicite
dans l'URL reste prioritaire sur la rubrique mémorisée. Ces préférences d'affichage
restent séparées des sauvegardes du garage.

## Historique, montants et documents

Une fiche peut décrire une révision, une réparation, un achat, une mise en circulation,
un programme d'entretien, un relevé kilométrique, du carburant ou de l'assurance.
Les dates, compteurs et montants peuvent rester inconnus. Un zéro connu est distinct
d'une valeur absente. Les relevés contradictoires sont conservés pour être corrigés
à partir de leur source.

Les lignes détaillées séparent pièces, main-d'œuvre, prestations, forfaits et frais.
Elles portent leurs propres notes, documents et liens vers les composants. Le total
du justificatif, lorsqu'il est renseigné, est prioritaire. À défaut, Garapp additionne
les lignes complètes, ou la ventilation globale en l'absence de lignes. Un total
incomplet apparaît comme un sous-total connu. La ventilation globale et les lignes
ne sont pas additionnées ensemble.

Pour un forfait, ajouter une seule ligne de nature **Forfait**, saisir son prix puis
cocher tous les **Composants de la ligne**. Il est aussi possible de créer plusieurs
composants directement depuis cette ligne. L’action choisie (remplacement, contrôle
ou entretien) s’applique à tous ; le prix est compté une seule fois, sans répartition
inventée entre les pièces. Si les actions diffèrent, utiliser des lignes distinctes
ou les associations complémentaires de la fiche, sans répéter le prix du forfait.

Les montants conservent leurs décimales d'origine. Les synthèses arrondissent seulement
après addition. Les remboursements restent négatifs. Une fiche liée à plusieurs
composants est comptée une seule fois. Le périmètre **Interventions** concerne
l'entretien ; **Tous les événements** inclut notamment le carburant et l'assurance.
Les fiches prévues ne participent pas aux dépenses enregistrées.

Les documents locaux peuvent être ajoutés, renommés, décrits et téléchargés depuis
les fiches. Leur contenu original est intégré aux sauvegardes en base64. Un lien
temporaire ne remplace pas un document. La limite est de **64 Mio par fichier** et
**512 Mio par sauvegarde**, base64 inclus. Les notes, corps de fiches et propriétés
JSON complémentaires sont conservés ; leur texte n'est pas exécuté comme du HTML.

## Composants et vue 3D

Les intervalles d'entretien se règlent en kilomètres ou en mois. Le premier seuil
atteint gouverne le repère. Seul un remplacement explicite remet le suivi à zéro :
un contrôle ou une observation peut documenter une pièce sans la remplacer.
Ces repères ne constituent pas un diagnostic ni une recommandation constructeur.

La vue éclatée représente les composants manuels et les mentions positives explicites
dans les intitulés et lignes de fiches. Les notes ne servent pas à déduire un équipement.
Les fiches prévues, futures ou dans la corbeille ne confirment aucune présence.
Les propositions sont visibles avant enregistrement et peuvent être modifiées,
reliées à un composant existant ou décochées.

Les anciens libellés sans lien peuvent produire une représentation en lecture seule.
**Enregistrer et préciser** crée une fiche de composant et ses liens d'observation,
sans réécrire les sources. Une ligne de pièce au nom libre peut utiliser une forme
générique. Les équipements manuels restent indépendants des fiches sources.

**Disposition du véhicule** règle les emplacements de roues (2 à 12), de portières
latérales (1 à 8, hors hayon) et le moteur avant, central ou arrière. Une position
explicitement enregistrée reste prioritaire. Ces emplacements sont schématiques :
ils ne créent pas de composants et ne confirment pas l'équipement réel. Les composants
sans emplacement reconnu restent dans **À placer**.

Rotation, zoom, vues de dessus et de côté, éclatement et sélection sont disponibles.
**Afficher les noms** complète le nom de la pièce sélectionnée. Le clavier et le
sélecteur natif donnent accès à tous les composants ; la liste reste disponible.
Le rendu affiche au plus 80 composants à la fois, avec recherche et sélection pour
accéder aux autres. Il fonctionne hors connexion avec des volumes génériques.

## Assurance mensuelle

Un contrat définit sa première échéance, le jour mensuel de prélèvement et son tarif.
Les mois courts utilisent leur dernier jour. L'application rattrape les échéances
à son ouverture et au retour au premier plan, puis les vérifie chaque minute tant
qu'elle reste ouverte. Ce calendrier ne vérifie pas les opérations bancaires.

Une modification peut concerner un seul prélèvement ou ce mois et les suivants.
Les tarifs successifs et les ajustements ponctuels sont conservés. Les échéances
futures restent prévisionnelles et exclues des dépenses réalisées. Une fin de contrat
arrête les nouvelles échéances sans supprimer l'historique.

Un prélèvement mis à la corbeille n'est pas recréé. Sa suppression définitive conserve
le mois exclu dans le calendrier pour empêcher sa réapparition. Les contrats, documents,
tarifs et ajustements font partie des sauvegardes complètes.

## Statistiques et carburant

Les courbes kilométriques utilisent les relevés datés de la fiche véhicule et de
l'historique actif. Les points suivent leurs dates réelles et donnent accès aux sources.
Les fiches prévues, futures ou sans date/compteur sont exclues des calculs concernés.
Des compteurs contradictoires un même jour ou une baisse empêchent le calcul d'un
écart global trompeur. Le rythme annualisé exige au moins 30 jours et décrit la période
observée ; il ne prévoit pas le kilométrage futur.

Les dépenses sont regroupées par mois, ou par année au-delà de 24 mois. Les tableaux
donnent les montants et sources. Une période vide ne prouve pas l'absence de dépenses.

Une fiche **Carburant** peut renseigner les litres, le montant payé, la date, le compteur
et le caractère complet ou partiel du plein. Le compteur reste facultatif.

- **Consommation en L/100 km** : litres ajoutés après un premier plein complet, ajouts
  partiels inclus, jusqu'au plein complet suivant, divisés par la distance du cycle,
  puis multipliés par 100. Le volume du plein initial ne fait pas partie du cycle.
  La moyenne est pondérée par les distances et suppose que tous les ajouts sont saisis.
- **Distance estimée** : si le compteur d'un plein manque, Garapp l'interpole entre
  les deux relevés datés valides les plus proches qui l'encadrent, proportionnellement
  au temps écoulé. Aucune extrapolation n'est faite hors de ces bornes. Les valeurs
  concernées sont signalées en orange avec **≈**. Les compteurs saisis sur les deux
  pleins permettent une mesure directe de la distance.
- **Prix moyen en €/L** : somme des montants complets connus divisée par la somme
  des litres des mêmes achats. La moyenne est donc pondérée par les litres. Les achats
  sans montant complet, sans litres ou avec un montant négatif sont exclus et signalés
  dans le tableau. Un montant nul connu reste utilisable. La courbe verte utilise
  l'axe de droite en €/L, distinct de la consommation.

Les achats et leur prix suivent leur date. La consommation est rattachée au mois du
plein final ; les distances entre relevés, au mois du relevé final. Un intervalle peut
commencer le mois précédent. La distance mensuelle relevée est distincte de la distance
estimée des cycles ; un bilan calendaire complet exige des relevés aux limites du mois.

Une quantité manquante invalide le cycle concerné. Un ajout sans date empêche de situer
les ajouts entre les pleins et laisse la consommation inconnue. Les périodes sans
valeur calculable interrompent chaque série. La courbe montre les 36 derniers mois
de la période choisie ; le tableau conserve toute cette période.

## Photo ou modèle 3D du véhicule

Dans la fiche véhicule, **Photo ou modèle 3D (facultatif)** accepte une photo JPEG,
PNG ou WebP, ou un modèle GLB autonome. **Aucun visuel** masque l'image sans supprimer
son document. Les photos ne sont ni recadrées ni recompressées.

Le GLB propose rotation, zoom et recentrage. Ses données et textures doivent être
intégrées ; les compressions Draco, Meshopt et KTX2 ne sont pas prises en charge.
Le lecteur est fourni localement. Un appareil sans prise en charge 3D conserve
l'accès au fichier. Le visuel référence un document du véhicule sans le dupliquer.

## Corbeille

**Mettre à la corbeille** conserve la fiche complète, ses documents, ses lignes et
ses liens. Elle disparaît des statistiques et du suivi actif. Le compteur courant
du véhicule reste indépendant. La corbeille est accessible depuis **Interventions**
ou **Outils**, avec restauration et suppression définitive après confirmation.

La corbeille accompagne les exports et les versions Drive. Elle n'expire pas
automatiquement. Les copies externes déjà conservées ne sont pas modifiées par
une suppression. Seules les fiches placées dans cette corbeille sont restaurables
depuis celle-ci.

## Sauvegarder et importer

**Outils → Sauvegardes** réunit les copies dans un fichier et la synchronisation
Google Drive. Le garage s'enregistre sur cet appareil ; une sauvegarde permet de le
retrouver ailleurs ou après la perte du stockage du navigateur.

- **Télécharger une sauvegarde** crée un fichier JSON complet, documents inclus.
  Son nom est unique et daté. Vérifier sa présence dans les fichiers téléchargés.
- **Importer une sauvegarde** ouvre un fichier et compare son contenu au garage
  actuel avant toute modification.
- Les fichiers liés sont dans **Options avancées**.

À l'ouverture d'un fichier, Garapp valide son contenu puis affiche uniquement les
**différences** avec le garage ouvert, regroupées par véhicule, fiche ou composant.
Les champs identiques sont masqués. Une sauvegarde version 1 est migrée ; une version
future inconnue est refusée.

La comparaison présente les choix à faire en premier :

1. Pour chaque valeur différente, sélectionner **Cet appareil** ou **Sauvegarde**.
   Le choix est mis en évidence. Rien n'est sélectionné à l'avance pour ces conflits.
2. Les éléments présents dans une seule copie sont conservés automatiquement.
   Déplier leur liste pour les consulter ou en exclure un. Les commandes de choix
   groupé sont facultatives et ne changent pas ces ajouts.
3. Cliquer sur **Appliquer les choix**. Garapp vérifie le résultat, conserve les deux
   sources dans les copies de récupération, puis enregistre le garage fusionné.
   Un échec laisse le garage ouvert inchangé.

Les éléments sont rapprochés par leurs identifiants, jamais par leur nom. Deux fiches
homonymes avec des identifiants différents restent distinctes. Sans historique commun
fiable, l'absence d'un élément ne prouve pas sa suppression : il est conservé, sauf
choix explicite de l'exclure. Les valeurs liées d'un document sont choisies ensemble
pour préserver son contenu original. Une fiche active dans une copie et à la corbeille
dans l'autre demande un choix de classement ; elle ne peut pas apparaître dans les
deux emplacements à la fois. Les liens incohérents doivent être résolus avant fusion.

Pour une échéance d'assurance, l'exclusion explicite empêche sa recréation automatique
pour ce mois, sauf si une autre fiche du même contrat et du même mois est conservée,
active ou à la corbeille. Choisir explicitement **Prévu** pour une échéance générée
la maintient prévisionnelle en désactivant sa validation automatique. Un choix qui
réactive explicitement cette validation doit être corrigé avant de fusionner.

Dans **Autres options**, **Remplacer tout le garage** permet de reprendre un garage
complet. Le téléchargement d'une copie du garage ouvert est demandé, puis une copie
de récupération locale est enregistrée. Le garage affiché ne change qu'après la
réussite de cette copie et de l'enregistrement du garage importé. Si le garage ou un
fichier lié change pendant la comparaison, rouvrir le fichier pour examiner les
différences à jour.

**Récupérer une ancienne copie** ouvre les **Copies de récupération** : les états
précédant un import, les deux sources d'une fusion ou l'état précédant la première
écriture d'un modèle migré.
**Ouvrir cette copie** lance la comparaison habituelle avant de choisir les données
à reprendre. Le téléchargement reste disponible pour conserver une copie à part.
Ces archives sont conservées sur cet appareil, sans suppression automatique, et
restent séparées du garage actif. Elles ne sont pas incluses dans un export courant
du garage et ne protègent pas contre l'effacement du stockage navigateur.

Si les données enregistrées ne peuvent pas être ouvertes, **Exporter les données
conservées** permet de récupérer leur JSON tel qu'il est stocké, sans migration ni
réécriture. Conserver ce fichier avant toute tentative de réparation.

Dans **Options avancées**, les navigateurs compatibles permettent de créer ou
d'ouvrir un fichier JSON lié.
Un fichier déjà rempli doit être comparé avant import. Sa liaison reste locale au
navigateur, hors du JSON portable. Avant mise à jour, Garapp vérifie son empreinte,
puis relit le résultat après écriture. Un changement externe détecté bloque l'écrasement.
Web Locks coordonne les onglets d'une même origine, sans verrouiller les autres logiciels.

L'écriture automatique du fichier lié est facultative et doit être réactivée à chaque
ouverture. Elle suit un enregistrement local réussi après une courte pause. Une erreur,
un conflit, un import ou un changement de fichier la suspend. Elle ne fonctionne pas
navigateur fermé. Un import ordinaire détache l'ancien fichier ; ouvrir un fichier
existant puis choisir le remplacement complet le lie après import réussi, avec
l'automatisme désactivé. Une fusion détache le fichier précédent et ne lie pas le
fichier reçu : les fichiers sources restent intacts. Pour conserver le résultat,
télécharger une nouvelle copie ou créer un nouveau fichier lié.

Conserver plusieurs exports datés, dont un sur un autre support, permet de revenir à
un état antérieur. Le stockage du navigateur peut être effacé, indisponible ou saturé.
Une erreur d'enregistrement est affichée et la copie ouverte reste exportable.

## Google Drive

Dans **Sauvegardes**, la connexion facultative à **Google Drive** permet de retrouver
le garage sur plusieurs appareils. Choisir un dossier existant ou créer une première
sauvegarde, puis utiliser **Synchroniser maintenant**. **Historique des sauvegardes**
donne accès aux anciennes versions ; **Changer de sauvegarde Drive** permet de
choisir un autre dossier.

La connexion utilise un dossier privé propre à cette version de Garapp.
Chaque révision est un JSON complet avec ses documents ; les précédentes ne sont
ni modifiées ni supprimées automatiquement. **Comparer** présente seulement les
différences entre le garage ouvert et la version choisie. La fusion utilise les mêmes
choix par champ que l'import JSON et crée une nouvelle révision Drive. Elle réunit
uniquement les deux copies affichées ; les autres branches concurrentes restent à
comparer séparément. Les deux sources et les anciennes versions restent conservées.
**Autres options** permet de choisir un garage complet. Une nouvelle modification
pendant la comparaison impose de la reprendre.

L'automatisme contrôle les versions tant que la page est visible, au retour du réseau
et après une modification enregistrée. Les jetons restent en mémoire et une reconnexion
demande un clic. La fermeture de l'application arrête la synchronisation.

Les conditions de configuration, les transferts entre appareils, les protections et
les limites sont détaillés dans le [guide Google Drive](google-drive.md).

## Installation et hors connexion

**Outils → Installation, hors connexion et mises à jour** propose l'installation et
les instructions adaptées au navigateur. Une première ouverture connectée prépare
les ressources publiques. Le panneau confirme quand Garapp peut être rouvert hors
connexion. Le garage et les documents restent dans leur stockage local, hors du cache
de l'application.

Une nouvelle version est proposée par un bandeau et son activation demande un clic.
Les formulaires ouverts, imports, conflits et écritures en cours empêchent le
rechargement. Une activation dans un autre onglet ne recharge pas les autres pages.
Le service worker vérifie les empreintes de ses ressources avant d'activer une version.

Les installations principale et **Garapp dev** ont des identités et caches distincts.
Installer l'application sur un autre appareil ne transfère pas le garage. Les exports
externes restent nécessaires contre la perte de l'appareil ou du stockage navigateur.
