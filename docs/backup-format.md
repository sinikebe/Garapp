# Format de sauvegarde Garapp — version 2

Une sauvegarde est un fichier JSON UTF-8 autonome. Son import et son export restent
locaux au navigateur. L’option Google Drive transfère ces mêmes JSON complets après
connexion et activation explicites. Le dépôt et les pages publiées ne doivent contenir aucune
donnée personnelle importée. Les exemples fournis sont entièrement fictifs.

Le [fichier d’exemple](examples/garage-v2.json) est validé par les tests du projet.
Il présente des montants précis, des champs inconnus, des événements, des notes,
des données complémentaires et un petit document intégré.

## Contrat de conservation

- `version` vaut `2`. Les sauvegardes `version: 1` sont mises à niveau à la lecture.
  Les sauvegardes d’une version future sont refusées sans remplacer le garage.
- Les identifiants sont des chaînes de 1 à 128 caractères alphanumériques, `_` ou `-`.
  Un UUID d’origine peut être réutilisé. Ils sont uniques dans chaque collection.
- Chaque propriété JSON supplémentaire est conservée, même si l’interface ne lui
  attribue pas de fonction particulière. Elle apparaît dans « Autres informations
  conservées » et peut être modifiée dans « Autres données (JSON) ».
- Une propriété inconnue ne doit pas remplacer un champ réservé. Les réservations
  sont locales à chaque objet : `description` sur une ligne est un texte, par exemple.
- Les libellés ne sont pas des identifiants : plusieurs lignes ou composants peuvent
  avoir le même nom. Les occurrences et leurs liens doivent être conservés.
- Les informations manquantes restent manquantes. `null` est distinct du nombre
  zéro et du montant `"0"`. Aucune date, catégorie, durée de vie ou somme ne doit être inventée.
- Les textes `notes`, `description` et `content` sont conservés tels quels et affichés
  comme du texte. Du Markdown ou du HTML source peut être archivé dans `content` ;
  il n’est pas exécuté. Les résultats, définitions de formules ou propriétés de la
  source peuvent être rangés dans une propriété complémentaire `sourceProperties`.
- Pour les valeurs dont la représentation exacte importe, utiliser des chaînes
  plutôt que des nombres JSON : décimales, références longues, codes et identifiants.

## Racine

| Champ | Type | Rôle |
| --- | --- | --- |
| `version` | entier `2` | Version du format |
| `activeId` | identifiant ou `null` | Véhicule sélectionné ; doit exister si renseigné |
| `vehicles` | tableau | Véhicules, au plus 100 |
| `documents` | tableau facultatif | Documents généraux du garage |
| Autres propriétés | JSON | Archives, notes globales, provenance, éléments non classés |

`vehicles`, `components` et `records` sont obligatoires, même lorsqu’ils sont vides.
Les collections facultatives absentes deviennent des tableaux vides.

## Véhicule

| Champ | Type | Rôle |
| --- | --- | --- |
| `id`, `name` | chaînes | Identifiant et nom non vide |
| `year` | entier 1900–2100 ou `null` | Année facultative |
| `engine` | chaîne, vide possible | Motorisation facultative |
| `odometer` | entier 0–5 000 000 ou `null` | Kilométrage courant |
| `odometerDate` | date ou `null` | Date du relevé courant |
| `example` | booléen facultatif | `true` uniquement pour un exemple fictif |
| `coverDocumentId` | identifiant facultatif ou `null` | Photo ou modèle affiché sur l’accueil ; référence un document intégré de ce véhicule. Absent ou `null` : aucun visuel |
| `componentLayout` | objet facultatif | Disposition schématique des composants connus ; ne crée aucun équipement |
| `components` | tableau | Composants suivis, au plus 10 000 |
| `records` | tableau | Historique actif |
| `trashedRecords` | tableau facultatif | Fiches dans la corbeille ; absence équivalente à une corbeille vide |
| `insurances` | tableau facultatif | Contrats d’assurance mensuels, au plus 100 par véhicule |
| `notes`, `content` | chaînes facultatives | Notes et corps de fiche |
| `documents` | tableau facultatif | Documents rattachés au véhicule |

Les anciens relevés sont des fiches `type: "reading"`. Un relevé historique
supérieur au kilométrage courant est conservé : l’import ne corrige pas une source
contradictoire. Les calculs d’entretien restent inconnus si les données sont incohérentes.
Un lien de fiche technique peut être conservé dans une propriété supplémentaire
`links`, par exemple `[{ "label": "Fiche technique", "url": "https://example.com/vehicle" }]`.

### Corbeille

Chaque entrée de `trashedRecords` contient `record` (une fiche complète au même
format que `records`), `deletedAt` (horodatage UTC `AAAA-MM-JJThh:mm:ss.sssZ`) et
éventuellement `position` (entier 0–20 000, ancienne position dans `records`). Les
champs supplémentaires de l’entrée et de la fiche sont conservés. La limite de
20 000 fiches par véhicule comprend les fiches actives et celles de la corbeille.
Les identifiants des fiches doivent être uniques entre les deux collections et
tous leurs liens de composants restent validés.

La corbeille est une extension facultative du format 2. Elle accompagne les
exports JSON, les fichiers liés et les versions Drive ; les lignes et documents
de ses fiches sont inclus dans l’inventaire de la sauvegarde. Les comparaisons
d’import distinguent les fiches actives de celles de la corbeille. Ces dernières
ne participent ni aux dépenses, ni aux graphiques, ni au suivi des composants.
La restauration conserve la fiche complète, son identifiant et ses relations.
Aucune date d’expiration n’entraîne sa suppression.

## Assurance mensuelle

`insurances` est une extension facultative du format 2. Son absence reste conservée
dans les anciens garages. Chaque contrat comporte les champs suivants :

| Champ | Type | Rôle |
| --- | --- | --- |
| `id` | identifiant | Unique dans les contrats du véhicule |
| `provider`, `reference` | chaînes facultatives | Assureur / intitulé et référence du contrat |
| `firstDate` | date 1900–2199 | Date exacte de la première échéance |
| `debitDay` | entier 1–31 | Jour des échéances suivantes, ramené au dernier jour des mois courts |
| `endDate` | date ou `null` | Dernière date d’échéance autorisée, incluse ; après `firstDate` ou égale |
| `tariffs` | tableau non vide, au plus 1 000 entrées | Historique des tarifs `{ "from": "AAAA-MM", "amount": "49.90" }` |
| `skippedPeriods` | tableau facultatif de mois uniques | Mois exclus après suppression définitive d’une fiche |
| `notes`, `content`, `documents` | formats habituels | Notes, contenu et documents intégrés du contrat |
| Autres propriétés | JSON | Conservées, y compris dans chaque tarif |

Chaque montant récurrent est une chaîne décimale positive ou nulle. Au moins un
tarif doit couvrir le mois de `firstDate`. Le tarif applicable est celui dont
`from` est le plus récent sans dépasser le mois concerné ; à mois égal, la dernière
entrée du tableau gagne. Les anciennes entrées restent conservées. Une modification
« ce prélèvement et les suivants » remplace également les changements déjà prévus
après ce mois, en ajoutant des tarifs de remplacement aux mois correspondants.

Les prélèvements échus deviennent des fiches habituelles `type: "insurance"`.
Leur objet `insurance` contient `contractId` (contrat du même véhicule), `period`
(`AAAA-MM`), et éventuellement les booléens `generated`, `overridden`, `autoStatus`.
Les champs supplémentaires de cet objet sont conservés. Un couple contrat/mois
ne peut apparaître qu’une fois, entre fiches actives et corbeille. Une fiche
d’assurance sans objet `insurance` reste un événement indépendant valide.

La date réelle peut différer du mois de cotisation ; les dépenses utilisent la
date réelle, l’échéancier utilise le mois de cotisation. Une correction ponctuelle
conserve le tarif récurrent et peut indiquer un remboursement négatif. Les notes,
documents, lignes et données complémentaires du prélèvement sont conservés lors
d’un changement de montant. Les fiches antérieures et celles de la corbeille ne
sont pas réécrites par un nouveau tarif ultérieur.

La génération s’effectue dans l’application après validation, jamais dans le
lecteur de sauvegarde. Elle utilise des identifiants déterministes et rattrape
les mois échus sans créer de doublon. Les échéances futures sont calculées à la
demande. Une correction explicite d’un mois futur crée une fiche `planned` ; avec
`generated: true` et `autoStatus` différent de `false`, elle devient `done` à sa
date si elle reste dans le calendrier du contrat. Un statut explicitement modifié
dans l’éditeur de fiche désactive cette conversion avec `autoStatus: false`.

Les fiches de la corbeille bloquent la génération de leur mois. Une suppression
définitive ajoute le mois à `skippedPeriods` avant de retirer la fiche et ses
documents. Les contrats et leurs documents participent aux exports complets,
aux versions Drive et à l’inventaire des documents avant import. L’assurance est
incluse dans les dépenses « Tous les événements » et ne sert pas de preuve de
présence ou de remplacement d’un composant.

## Composant suivi

| Champ | Type | Rôle |
| --- | --- | --- |
| `id`, `name` | chaînes | Identifiant et nom non vide |
| `group` | chaîne, vide possible | Ensemble, ou non classé |
| `intervalKm` | entier 1–1 000 000 ou `null` | Repère de distance, facultatif |
| `intervalMonths` | entier 1–1 200 ou `null` | Repère calendaire, facultatif |
| `description`, `notes`, `content` | chaînes facultatives | Informations conservées séparément |
| `documents` | tableau facultatif | Documents du composant |
| `spatial` | objet facultatif | Représentation générique et emplacement, sans modèle de voiture |

Un composant représente ce qui est suivi dans le véhicule. Ses achats, interventions
et prix historiques sont portés par les lignes des fiches, pas par un prix courant
unique. Une entrée source qui ne représente pas une pièce peut rester une ligne de
prestation, ou un élément complémentaire du garage. Un modèle vide peut être conservé
sans être présenté comme une pièce réelle, dans une propriété complémentaire `templates`.

### Disposition du véhicule

`vehicle.componentLayout` accepte `wheelCount` (entier de 2 à 12), `doorCount`
(entier de 1 à 8, portières latérales hors hayon) et `enginePosition` (`front`,
`center` ou `rear`). Les autres propriétés et leurs valeurs imbriquées sont
conservées. Les choix concernent la représentation des groupes de composants,
sans modifier leurs identifiants, leurs associations ou leurs repères d’entretien.

Sans réglage explicite, le schéma utilise quatre emplacements de roue, quatre
portières latérales et un compartiment moteur avant. Une position avant, centrale
ou arrière explicitement connue pour un moteur peut fournir la disposition du
compartiment moteur en l’absence de réglage. Ces valeurs d’affichage ne sont pas
ajoutées à la sauvegarde à sa lecture et ne confirment aucun équipement.

### Représentation des composants

`spatial` contient les propriétés facultatives suivantes. Les propriétés
supplémentaires, y compris leurs valeurs imbriquées, restent conservées.

| Champ | Valeurs | Rôle |
| --- | --- | --- |
| `kind` | `unknown`, `engine`, `battery`, `belt`, `braking`, `drum`, `disc`, `pads`, `tire`, `wheel`, `oilFilter`, `airFilter`, `cabinFilter`, `fuelFilter`, `oil`, `coolant`, `shock`, `exhaust`, `clutch`, `gearbox`, `steering`, `wiper`, `sparkPlug`, `door`, `hood`, `tailgate`, `bumper`, `mirror`, `headlight`, `rearLight`, `radiator`, `fuelTank` | Forme générique ; `braking` ne précise pas un disque ou un tambour |
| `zone` | `unknown`, `front`, `rear`, `cabin`, `engineBay`, `underbody` | Position explicitement renseignée ; `unknown` laisse l’affichage utiliser les emplacements schématiques du type, ou « À placer » si aucun n’est connu |
| `side` | `unknown`, `left`, `right`, `center` | Côté explicitement renseigné |
| `presenceOrigin` | `manual`, `record` | `record` : présence issue des fiches, confirmée uniquement par une source active non prévue et non future |

Sans objet `spatial`, une mention explicite dans le nom peut fournir une forme ou
une position à l’affichage. Une valeur `unknown` reste inchangée dans les données ;
un type reconnu peut recevoir un emplacement schématique sans confirmer sa position
réelle. Aucune disposition propre à une marque ou un modèle n’est supposée.
Un composant non reconnu conserve son nom et une forme générique. La propriété
supplémentaire `origin`, si présente sur le composant, reste une donnée source
ordinaire ; elle n’est pas utilisée comme indicateur de présence.

Les intitulés et libellés positifs d’anciennes fiches peuvent aussi produire des
composants dérivés pour l’affichage. Cette projection n’altère pas le JSON. Les
notes et corps de fiches ne sont pas analysés. Les négations, hypothèses, devis et
mentions de prévision ne créent pas d’équipement. Enregistrer un composant repéré
crée sa fiche et des liens d’observation vers les sources, sans supposer un
remplacement. Les composants déjà ajoutés manuellement restent représentés même
si aucune intervention ne les documente.

## Fiche d’historique

| Champ | Type | Rôle |
| --- | --- | --- |
| `id`, `title` | chaînes | Identifiant et intitulé non vide |
| `type` | chaîne facultative | Catégorie, par défaut `unclassified` |
| `status` | `done`, `planned`, `incomplete` | Enregistré, prévu ou à compléter ; défaut `done` |
| `date` | `AAAA-MM-JJ` ou `null` | Date réelle valide, facultative |
| `odometer` | entier 0–5 000 000 ou `null` | Kilométrage historique, facultatif |
| `partsAmount`, `laborAmount` | montant ou `null` | Ventilation globale utilisée si aucune ligne détaillée |
| `totalAmount` | montant ou `null` | Total du justificatif ; fait autorité s’il est renseigné |
| `componentIds` | tableau d’identifiants | Composants remplacés ou renouvelés, sans doublon |
| `observedComponentIds` | tableau facultatif d’identifiants | Composants observés ou contrôlés, sans réinitialiser le suivi de remplacement |
| `lines` | tableau facultatif | Lignes détaillées, au plus 10 000 par fiche |
| `notes`, `content` | chaînes facultatives | Commentaires et corps de fiche |
| `documents` | tableau facultatif | Justificatifs, factures, photos, etc. |
| `fuel` | objet facultatif | Quantité et indication de plein complet pour un événement carburant |
| `insurance` | objet facultatif | Contrat et mois d’un prélèvement d’assurance récurrent |

Les identifiants de `observedComponentIds` doivent désigner des composants du même
véhicule et ne pas être dupliqués dans le tableau. Les observations sont conservées
dans les sauvegardes, y compris pour les fiches de la corbeille. L’historique d’un
composant réunit observations, remplacements et lignes associées ; seuls les
remplacements explicites réinitialisent ses repères. Les propositions visibles
dans l’éditeur d’intervention peuvent créer un composant et son lien dans la même
transaction d’enregistrement.

### Événement carburant

Une fiche `type: "fuel"` utilise la date, le compteur, le total du justificatif,
les documents et les autres champs habituels. Son objet facultatif `fuel` contient :

| Champ | Type | Rôle |
| --- | --- | --- |
| `litres` | chaîne décimale positive ou `null` | Quantité ajoutée, au plus 10 000 L ; toutes les décimales sont conservées |
| `fullTank` | booléen ou `null` | `true` : réservoir rempli ; `false` : ajout partiel ; `null` : inconnu |
| Autres propriétés | JSON | Informations de station, provenance ou autres données complémentaires |

Un objet absent ou des champs absents ne supposent aucune quantité ni plein
complet. Une fiche carburant ancienne reste lisible sans cet objet. Les données
carburant sont également validées et conservées dans les fiches de la corbeille.
`totalAmount` reste le montant payé faisant autorité ; les litres ne sont pas
additionnés aux montants. Le carburant entre dans le périmètre de dépenses
« Tous les événements », séparément des interventions.

La consommation est calculée entre deux pleins complets : les litres ajoutés
après le premier plein, ajouts partiels inclus, jusqu’au plein final sont divisés
par les kilomètres entre les deux pleins, puis multipliés par 100. Une quantité
manquante invalide le cycle concerné ; le plein complet suivant peut servir de
nouveau départ. Un événement carburant sans date empêche de situer les ajouts et
laisse la consommation inconnue. Aucun résultat ne doit être déduit d’une simple
quantité partielle ou d’une capacité de réservoir supposée.

Les achats mensuels suivent leur date. Les cycles sont rattachés au mois du plein
final et les distances observées au mois du relevé final. Il ne s’agit pas d’une
répartition estimée par jour ; un intervalle peut commencer dans un autre mois.
Des relevés aux limites de mois sont nécessaires pour un bilan calendaire complet.

Catégories reconnues : `revision`, `entretien`, `reparation`, `controle`, `acquisition`,
`registration`, `plan`, `reading`, `other`, `unclassified`. Une autre chaîne de catégorie
est conservée et accessible dans les filtres et le formulaire d’édition.

Les types `acquisition`, `registration`, `plan` et `reading` sont exclus du périmètre
« Interventions » des dépenses. Le périmètre « Tous les événements » les inclut.
Les fiches `planned` sont exclues des dépenses et ne démarrent aucun suivi d’entretien.
Les fiches non datées sont accessibles avec la période « Sans date » ou « Tout l’historique ».

## Ligne détaillée

| Champ | Type | Rôle |
| --- | --- | --- |
| `id`, `label` | chaînes | Identifiant de ligne et libellé non vide |
| `kind` | catégorie ci-dessous | Nature financière, défaut `unclassified` |
| `amount` | montant ou `null` | Total TTC de la ligne, avec sa précision d’origine |
| `componentId` | identifiant ou `null` | Composant suivi concerné, si identifiable |
| `effect` | action ci-dessous | Effet sur le suivi, défaut `none` |
| `description`, `notes`, `content` | chaînes facultatives | Description, commentaires, corps de fiche source |
| `documents` | tableau facultatif | Documents propres à cette ligne |

`kind` : `part`, `labor`, `service`, `bundle`, `fee`, `other`, `unclassified`.

`effect` : `none`, `replace`, `inspect`, `service`. `replace` exige un `componentId`.
Un contrôle peut être associé à une pièce sans réinitialiser son dernier remplacement.
Le champ `componentIds` de la fiche sert uniquement aux autres remplacements ; répéter
le même lien sur une ligne n’entraîne pas de double compte financier.

Les quantités, prix unitaires, références, informations d’assurance et ventilations
supplémentaires peuvent être conservés comme champs additionnels. `amount` reste le
total de la ligne : aucune multiplication implicite par une quantité n’est effectuée.
Les forfaits ne sont pas ventilés artificiellement entre pièces et main-d’œuvre.

## Montants et totaux

Un montant est une **chaîne décimale en euros**, avec un point, ou `null` : `"12.345"`,
`"0"`, `"-5.50"`, `null`. Au plus 12 chiffres avant et 18 après le point. Pas de notation
scientifique ni de symbole monétaire. Les montants négatifs représentent notamment
les remises et remboursements.

Les additions utilisent des décimales exactes. Les écrans de synthèse arrondissent
le résultat aux centimes, à la moitié en s’éloignant de zéro. Le détail de chaque ligne
conserve et affiche le montant source exact.

Ordre de calcul du total d’une fiche :

1. `totalAmount`, s’il est renseigné ;
2. somme des lignes si toutes ont un montant connu ;
3. somme de `partsAmount` et `laborAmount` si aucune ligne n’existe et si les deux montants sont connus ;
4. sinon : total inconnu, accompagné du sous-total des montants connus.

Les lignes et la ventilation globale ne sont jamais additionnées ensemble.
Un total documentaire peut différer du détail, notamment à cause d’un arrondi de facture.

## Document autonome

Le même objet peut figurer dans `documents` du garage, d’un véhicule, d’un composant,
d’une fiche ou d’une ligne.

| Champ | Type | Rôle |
| --- | --- | --- |
| `id` | chaîne | Identifiant unique dans la collection de documents de son propriétaire |
| `name` | chaîne | Nom de fichier original non vide |
| `mimeType` | chaîne | Par exemple `application/pdf` ou `image/jpeg` |
| `dataUrl` | chaîne | `data:<mimeType>;base64,<contenu complet>` |
| `size` | entier facultatif | Taille binaire décodée ; vérifiée si présente, calculée sinon |
| `description` | chaîne facultative | Légende ou description du document |
| Autres propriétés | JSON | Provenance et métadonnées conservées |

Le document original doit être téléchargé par le producteur de la sauvegarde et
son contenu encodé en base64. **Un lien de téléchargement temporaire ne remplace
pas le fichier.** Garapp ne télécharge pas les documents depuis leurs liens externes.
La synchronisation Drive transporte les documents déjà intégrés au JSON.
Les liens utiles peuvent être conservés en supplément pour la traçabilité.

Un document ne peut dépasser 64 Mio. Le fichier JSON importé est limité à 512 Mio,
base64 inclus. Les fichiers binaires restent intégrés au JSON exporté et sont
stockés dans IndexedDB. Les clés restent propres au chemin publié, donc `main`
et `dev` ont des garages distincts. Une erreur de quota laisse la copie ouverte
exportable et affiche l’échec ; elle n’est pas annoncée comme un enregistrement réussi.

## Contrôle avant livraison d’une sauvegarde

- Comparer les nombres d’entrées, de lignes et de documents avec la source.
- Vérifier chaque relation par identifiant, y compris les noms répétés.
- Comparer les montants exacts et distinguer une valeur absente de zéro.
- Conserver tous les commentaires, corps de fiches et informations non classées.
- Vérifier le contenu binaire des documents, pas seulement leur nom ou leur URL.
- Valider le JSON avec `parseGarage`, puis vérifier qu’un second passage conserve
  le résultat intégral : `parseGarage(JSON.stringify(parseGarage(json)))`.

Le téléchargement d’une copie précédente est demandé avant le remplacement du garage
dans l’interface ; le navigateur ne confirme pas sa conservation sur disque. Les copies
ont un nom unique horodaté et les copies précédant un import portent `avant-import`.
La liaison facultative à un fichier et le suivi des exports restent propres au navigateur
et au chemin publié : ils n’ajoutent aucun champ au JSON portable. Le fichier lié est
vérifié avant écriture et relu après écriture ; un changement externe détecté suspend
sa mise à jour. Les modifications de plusieurs appareils ne sont pas fusionnées.
Le fichier produit pour une personne reste privé et ne doit pas être
ajouté aux exemples ou au dépôt public.
