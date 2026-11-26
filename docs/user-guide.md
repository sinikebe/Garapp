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
| Graphiques | Explorer les mesures et opérations depuis leur accès dédié dans le dock |

Les présentations **Horizon**, **Atelier** et **Panorama** adaptent la disposition du
garage. La présentation et l’apparence sont regroupées dans **Outils → Affichage**.
Le choix du véhicule apparaît dans la barre du haut et se replie dans **Outils**
quand la place manque. La rubrique active est indiquée dans le dock ou le menu
latéral. L’en-tête compact garde les accès rapides, les outils et le profil Drive. Le logo
ouvre le menu des applications finapps. Les liens relient les versions principales
entre elles, et les versions de développement entre elles.

Les actions rapides sont accessibles avec **Ctrl/Cmd K**. Les menus se ferment par
clic extérieur ou Échap et rendent le focus à leur commande. Les boutons d'information
donnent accès aux explications au clavier, au clic et au toucher. L'impression/PDF
est disponible dans les outils.

La rubrique et les filtres utiles sont mémorisés par véhicule. Un fragment explicite
dans l'URL reste prioritaire sur la rubrique mémorisée. Ces préférences d'affichage
restent séparées des sauvegardes du garage.

## Supprimer un véhicule

Dans **Vue d’ensemble**, ouvrir **Fiche du véhicule**, puis choisir
**Supprimer le véhicule** et confirmer. Le véhicule est retiré avec ses interventions,
sa corbeille, ses composants, ses assurances et ses documents. Les autres véhicules
et les documents généraux du garage sont conservés. Supprimer le dernier véhicule
laisse un garage vide, dans lequel un nouveau véhicule peut être ajouté.

Une copie complète est enregistrée avant la suppression. Si cette copie ou
l’enregistrement échoue, le garage reste inchangé. Pour récupérer le véhicule,
ouvrir **Outils → Sauvegardes → Récupérer une ancienne copie**, puis la copie
**Avant la suppression d’un véhicule**. La comparaison permet de réintégrer le
véhicule sans remplacer tout le garage.

Les copies de récupération restent propres à cet appareil ; elles ne sont pas
envoyées dans les sauvegardes suivantes. La synchronisation Drive et l’écriture
automatique dans un fichier lié prennent en compte la suppression lorsqu’elles
sont activées. Les anciennes versions Drive et les exports déjà téléchargés
restent inchangés. Une fusion avec une ancienne copie peut proposer de réintégrer
le véhicule absent : l’exclure pour conserver la suppression.

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

## Saisir et reconnaître les événements

Le formulaire adapte ses libellés au type choisi : révision, entretien, réparation,
contrôle, achat ou cession, mise en circulation, programme d’entretien, relevé,
assurance ou autre événement. Le compteur reste vide à la création pour renseigner
la valeur réellement observée à la date de l’événement.

Un relevé simple demande seulement la date et le compteur. Pour les autres types,
l’intitulé et le montant éventuel sont adaptés au contexte. Les notes, justificatifs
et l’état du dossier se trouvent dans les options. Choisir **Prévu** exclut la fiche
des dépenses enregistrées. Les coûts détaillés et les composants sont regroupés dans
une section facultative pour les interventions. Les données historiques déjà présentes
restent accessibles, y compris sur un relevé ou un événement administratif.
Le résumé de cette section signale les propositions de composants repérés. Elles
doivent être cochées explicitement pour être ajoutées à la fiche.

Le journal associe un repère coloré, une icône et le nom du type à chaque événement.
Il affiche le compteur pour un relevé, le budget d’un programme, la transaction d’un
achat ou d’une cession et le contexte de la cotisation pour une assurance liée à un
contrat. Les titres personnalisés et types historiques sont conservés.

## Alertes et vérifications régulières

La **cloche** de la barre du haut ouvre les alertes du véhicule sélectionné. Son
compteur regroupe les repères de pièces proches ou atteints et les contrôles à
prévoir ou à faire. Les pièces sans repère exploitable sont signalées séparément.
Pour les pièces, les intervalles en kilomètres et en mois se règlent dans
**Composants** : le premier seuil atteint déclenche l’échéance, avec une alerte dès
75 % de l’intervalle. Ce suivi ne mesure pas l’état physique des pièces.

Les rappels standard sont préparés une fois pour chaque véhicule, sans remplacer
les contrôles personnalisés existants : pression **chaque mois**, huile moteur
**tous les 2 500 km**, refroidissement et liquide de frein **tous les 3 mois**.
Ces fréquences proviennent des conseils de la Sécurité routière, non d’échéances
légales périodiques : [guide du bon conducteur, entretien](https://www.securite-routiere.gouv.fr/sites/default/files/2024-09/dsr_guide_bon_conducteur.pdf).
La pression doit suivre la notice du constructeur, à froid, avec un contrôle aussi
avant un long trajet : [référence officielle sur les pneus](https://www.alpes-de-haute-provence.gouv.fr/content/download/25301/144413/file/Etat%2520des%2520pneus.pdf).
Aucune pression universelle en bars n’est préremplie. Les conseils avant un trajet
et les liens vers les références sont disponibles dans le centre d’alertes.

Aucun contrôle passé n’est inventé : la première échéance est le jour de préparation,
et il faut noter le premier contrôle réellement effectué pour démarrer son cycle.
Le rappel d’huile est initialement en pause pour une motorisation explicitement
renseignée comme électrique sans mention de motorisation thermique ou hybride.
Les consignes restent à adapter au véhicule. Un rappel déjà modifié ou mis en pause
n’est pas réinitialisé au rechargement ou à la mise à jour.

Dans **Vérifications régulières**, les contrôles peuvent utiliser une fréquence en
**jours**, **mois calendaires** ou **kilomètres**. Les mois se calculent de date à date,
avec adaptation au dernier jour du mois si nécessaire. Les pré-alertes calendaires
couvrent le dernier quart de l’intervalle, arrondi au jour supérieur et limité à
7 jours ; les pré-alertes kilométriques couvrent le dernier quart de la distance.
Ces seuils d’anticipation appartiennent à l’application.

**Noter le contrôle** enregistre sa date réelle, avec un compteur et une observation
facultatifs, dans une fiche **Contrôle** du journal. Le compteur devient obligatoire
pour un rappel kilométrique. L’échéance repart de la date ou du compteur de ce contrôle.
Le suivi en kilomètres prend ensuite les relevés datés cohérents les plus récents,
y compris ceux du journal ; il demande une correction si les compteurs sont absents
ou incohérents. Les fiches prévues, incomplètes,
futures, sans date ou à la corbeille ne valident pas le rappel. Modifier la date ou
mettre cette fiche à la corbeille recalcule l’échéance ; la restaurer rétablit son
effet. Le compteur du véhicule n’est pas remplacé automatiquement. Désactivez
**Rappel actif** pour mettre un contrôle en pause sans perdre son historique.

Le volet **Notifications du navigateur** permet leur activation explicite sur cet
appareil. Le navigateur demande son autorisation si nécessaire. Les notifications
concernent le véhicule sélectionné et sont vérifiées tant que Garapp reste ouvert,
ainsi qu’à son retour au premier plan. Elles ne sont pas programmées quand l’app
est fermée. Une même alerte n’est pas renvoyée à chaque ouverture ; son passage de
**Bientôt** à **À faire**, ou un nouveau cycle, peut produire un nouveau rappel.
Un clic sur la notification ouvre les alertes. La compatibilité dépend du navigateur ;
les alertes dans la cloche restent disponibles sans autorisation.

Les définitions de contrôles et leurs fiches font partie du garage, des exports et
de la synchronisation Drive. L’autorisation, l’activation et la mémoire d’envoi des
notifications restent propres à l’appareil et à la version dev ou principale.

## Explorateur graphique

La rubrique **Graphiques**, accessible par son icône dans le dock ou le menu latéral,
permet d’afficher ensemble
le compteur, les dépenses mensuelles, les kilomètres parcourus, les litres ajoutés,
la consommation, le prix au litre et le coût carburant estimé au km. Toutes les
mesures et opérations sont activées au départ. Ouvrez **Éléments affichés** pour
activer ou masquer une mesure ou un type d’opération depuis les légendes.
Ces réglages sont repliés par défaut. Les pistes partagent les mêmes dates,
mais chacune conserve son unité et une échelle adaptée aux valeurs affichées.
Les champs **Du** et **Au** permettent de zoomer ; **Rétablir la période** revient
à la période choisie dans cette rubrique. **Tout afficher** active toutes les
mesures et tous les types d’opérations de cette période.

La seconde légende filtre les **repères des opérations**, sans modifier les
mesures calculées sur l’historique. Les dépenses conservent le périmètre choisi
au-dessus du graphique. Les indicateurs mensuels sont placés en fin de mois.
Les fiches prévues, futures, sans date ou à la corbeille restent exclues.

Une opération avec un compteur connu apparaît par un losange sur la piste du
compteur. Le bandeau inférieur affiche aussi les opérations sans compteur, à
leur date réelle. Un repère unique ouvre la fiche ; un groupe chiffré donne
accès aux opérations du même jour. Le sélecteur **Valeurs et opérations à consulter**
permet aussi la consultation au clavier, avec les valeurs exactes et les sources.
Les valeurs inconnues ne sont pas remplacées par zéro. Les estimations restent
signalées et les compteurs contradictoires ne sont pas reliés par une courbe.

Les visualisations sont regroupées dans **Graphiques**, y compris la répartition des
montants par type. **Statistiques** garde les indicateurs et les tableaux de sources ;
**Dépenses** conserve les montants par type sans leurs barres.

Sur la piste du compteur, les **kilomètres parcourus** apparaissent en colonnes,
**par an** au départ. Le choix **Kilomètres parcourus → Par mois** change ce découpage.
La courbe du compteur et les colonnes ont chacune une échelle en km, indiquée à gauche
et à droite. Les colonnes se masquent avec la mesure Kilomètres parcourus dans la
légende. Si le compteur est masqué, les distances restent sur leur propre piste.

La distance entre deux relevés valides est répartie entre les périodes traversées
au prorata du nombre de jours. Ce découpage est une **estimation**, signalée par ≈.
Les limites exactes entre relevés n’exigent pas d’interpolation. Aucun kilomètre n’est
extrapolé avant le premier relevé ou après le dernier. Une année ou un mois observé
partiellement reste signalé, et les intervalles incohérents ne sont pas inventés.
Un clic sur une colonne, ou sa date dans le sélecteur, donne accès à sa valeur et aux
relevés sources. Le zoom recalcule les colonnes sur l’intervalle visible.

Les choix graphiques sont conservés pendant la session pour chaque véhicule.
Sur petit écran, le graphique peut défiler horizontalement pour conserver des
graduations lisibles ; la légende et le sélecteur restent accessibles sous forme
de commandes classiques.

## Statistiques et carburant

Le formulaire véhicule propose une **capacité théorique du réservoir** facultative.
Le **coût carburant estimé au km** utilise le maximum entre cette valeur et le plus
gros ajout actif daté du véhicule, hors fiches prévues et futures. Cette référence
peut augmenter après un achat et diminuer après une correction ou suppression ;
la capacité théorique saisie reste conservée et les estimations sont recalculées.

Dans **Graphiques**, la consommation, le prix d’achat et le coût carburant estimé
conservent des pistes indépendantes sur les mêmes dates. Le coût reste exprimé en
€/km, avec l’équivalent en €/100 km dans les détails. Les inconnues interrompent les
courbes. **Statistiques** conserve les chiffres et le tableau mensuel complet.

Le coût estimé valorise les litres consommés au prix moyen pondéré du carburant
présent, puis mélange le reste avec l’achat suivant. Le premier plein complet
amorce le prix du stock préexistant avec le prix au litre de son achat. Avec des
ajouts partiels, la consommation du cycle est répartie selon les distances entre
ajouts, éventuellement interpolées. Un prix nécessaire inconnu, des distances
insuffisantes ou des volumes incompatibles avec la capacité rendent le coût
indisponible ; la consommation calculable reste disponible. La carte et le tableau
comptent séparément les cycles sans coût estimable. La moyenne pondère les seuls
cycles valorisés par leurs kilomètres. L’aide de la statistique détaille les
hypothèses ; il s’agit toujours d’une estimation qui suppose tous les ajouts saisis.

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
Le bouton **Ajouter du carburant** ouvre un formulaire dédié à ces cinq informations.
La note et le justificatif sont regroupés dans une section facultative. Modifier un
ravitaillement ouvre le même formulaire et conserve ses autres données historiques.
Dans le journal, les ravitaillements se distinguent par un repère violet et affichent
le volume, le remplissage, le prix au litre calculable, le compteur et le montant payé.

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
  dans le tableau. Un montant nul connu reste utilisable. La courbe du prix conserve
  sa propre piste en €/L dans Graphiques.

Les achats et leur prix suivent leur date. La consommation est rattachée au mois du
plein final ; les distances entre relevés, au mois du relevé final. Un intervalle peut
commencer le mois précédent. La distance mensuelle relevée est distincte de la distance
estimée des cycles ; un bilan calendaire complet exige des relevés aux limites du mois.

Une quantité manquante invalide le cycle concerné. Un ajout sans date empêche de situer
les ajouts entre les pleins et laisse la consommation inconnue. Les périodes sans
valeur calculable interrompent chaque série. Les graphiques et le tableau conservent
la période choisie, avec un zoom possible dans Graphiques.

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
et après une modification enregistrée. Les jetons d'accès restent en mémoire ; sur
`garapp.siniverse.cc`, la session sécurisée du Worker permet de les renouveler
après la réouverture de l'application. Si cette session expire ou si l'accès est
révoqué, une nouvelle connexion demande un clic. La fermeture de l'application
arrête la synchronisation jusqu'à la prochaine ouverture.

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
