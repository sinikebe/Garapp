# Sauvegardes Google Drive

[Accueil du projet](../README.md) · [Format de sauvegarde](backup-format.md)

## Activer la connexion Web

Sur `garapp.siniverse.cc`, un Worker commun à la suite conserve la session et
renouvelle l'autorisation Google. Le navigateur reçoit uniquement un jeton
d'accès court, conservé en mémoire, puis utilise l'API Drive v3 directement.
Sur les installations historiques et quand le Worker est inaccessible,
Google Identity Services garde la connexion manuelle actuelle, également
limitée à un jeton en mémoire. Aucun jeton Google n'est placé dans le stockage
persistant du navigateur ou dans les sauvegardes.

1. Utiliser le projet Google Cloud dédié à Garapp et vérifier que **Google Drive API** est activée.
2. Configurer Google Auth Platform : identité de l’application, audience et écran
   de consentement. En mode test, ajouter les comptes destinés aux essais.
3. Déclarer le seul scope demandé :
   `https://www.googleapis.com/auth/drive.file`.
4. Conserver le client OAuth **Application Web** existant pour conserver l'accès
   aux sauvegardes. Ajouter l'URI de redirection HTTPS du Worker
   `https://api.siniverse.cc/v1/garapp/callback`, sans supprimer les origines JavaScript autorisées
   (`https://garapp.siniverse.cc`, et les anciennes origines qui utilisent
   encore la connexion manuelle). Tester la lecture des dossiers et de leurs
   propriétés privées avant toute modification du client OAuth.
5. Conserver uniquement l’identifiant public se terminant par
   `.apps.googleusercontent.com`. En dev, le panneau **Sauvegardes → Configuration
   de développement** permet de le mémoriser sur cet
   appareil. Ce réglage local est un dépannage pour les essais sans client
   d’application commun. Pour la connexion normale, configurer une seule fois
   le client de Garapp en renseignant l’entrée `dev` ou `main` de
   `public/assets/js/drive-config.js`, puis régénérer le bundle hors connexion avec
   `npm run build:pwa`. Un identifiant client n’est pas un secret ; le secret client
   et la clé de chiffrement doivent rester exclusivement dans les secrets du Worker.
6. Ouvrir **Outils → Sauvegardes** dans Garapp et cliquer sur
   **Se connecter à Google Drive**. Sur le domaine de production, ce clic
   déclenche la redirection OAuth du Worker. Celui-ci demande l'accès hors ligne,
   puis crée une session protégée par cookie. Aux ouvertures suivantes, Garapp
   vérifie cette session et obtient un jeton de courte durée sans fenêtre Google.
   Un autre appareil doit s'authentifier une première fois. Le mode manuel
   historique conserve son choix de compte Google au clic.

Le client OAuth identifie l’application, pas une personne. Une fois l’identifiant
commun publié, les utilisateurs n’ont aucun projet Google Cloud ni identifiant
technique à saisir sur leurs appareils. Le réglage local de développement est
alors masqué et ses anciennes valeurs ne remplacent pas le client de l’application.

Aucune clé API ni compte de service n'est nécessaire. Le Worker garde un
**refresh token** chiffré côté serveur ; il n'est jamais publié ni envoyé au
navigateur. Un identifiant OAuth vide laisse l’option manuelle inactive ; les
sauvegardes locales restent utilisables. Les autorisations d’origines, l’activation
de l’API et les réglages d’audience doivent être effectués dans le projet Google.
Un identifiant client provenant d’un autre projet ne donne pas accès aux propriétés
privées créées par le précédent projet ; conserver le projet pour retrouver les dossiers.

## Refus de l’API après connexion

Un refus HTTP 403 de Drive arrive après l’obtention du jeton Google. Garapp
distingue les causes connues sans afficher le corps de la réponse, qui peut
contenir des informations privées.

- **API désactivée ou projet non configuré** : dans Google Cloud, sélectionner
  le projet contenant le client OAuth publié, puis **API et services → Bibliothèque
  → Google Drive API → Activer**. Une API activée dans un autre projet ne suffit
  pas. Attendre quelques minutes après l’activation puis réessayer.
- **Autorisation insuffisante** : se déconnecter de Garapp puis se reconnecter
  en accordant l’accès Drive demandé.
- **Fichier ou dossier non autorisé** : vérifier le compte Google, les droits
  sur le dossier et le projet du client OAuth.
- **Restriction Google Workspace** : demander à l’administrateur du compte
  d’examiner la politique d’accès aux applications Drive.
- **Quota ou limite de requêtes** : vérifier les quotas du projet ou attendre
  avant de réessayer. Un stockage plein nécessite de libérer de l’espace sur Drive.

Un refus inconnu conserve un message générique. Pour un diagnostic manuel dans
les outils du navigateur, consulter uniquement les champs `reason` de la réponse
à la requête Drive en échec. Ne jamais partager les en-têtes Authorization, les
jetons, une requête copiée en cURL ou un export réseau complet.

## Utilisation sur deux appareils

Sur le premier appareil, ouvrir **Outils → Sauvegardes**, connecter Google et créer
une première copie avec **Créer ma sauvegarde Drive**. L’envoi inclut tout le garage
et ses documents, jusqu’aux limites du format portable. L’automatisme est initialement en pause et
peut ensuite être activé pour ce dossier.

Sur le second appareil, ouvrir la même version publiée de Garapp, connecter le
même compte Google et sélectionner le dossier existant. Une première liaison ne
remplace rien : comparer une version pour examiner uniquement ses différences avec
le garage ouvert. Sélectionner les valeurs à garder puis **Appliquer les choix**
pour réunir les deux copies. **Autres options** permet de reprendre un garage
complet ou de télécharger les sources. La copie locale initiale est archivée sur
Drive avant tout remplacement.
Activer ensuite la synchronisation automatique si nécessaire. Si les deux garages
sont déjà identiques, une synchronisation les reconnaît après vérification.

Une fois le dossier choisi, **Synchroniser maintenant** lance une vérification.
Les versions qui demandent une comparaison sont mises en avant ; les anciennes
copies restent accessibles dans **Historique des sauvegardes**. **Changer de
sauvegarde Drive** permet de choisir un autre dossier.

La fusion rapproche les éléments par identifiant. La comparaison présente d'abord
les valeurs différentes à choisir : **Cet appareil** ou **Google Drive**. Les ajouts
présents dans une seule copie sont conservés et regroupés dans une liste repliée,
à ouvrir pour les consulter ou en exclure un. Les choix groupés facultatifs ne
s'appliquent qu'aux conflits. Les champs identiques ne sont pas affichés.
Les documents conservent leurs octets d'origine et sont choisis comme un ensemble
cohérent ; les champs complémentaires et les montants exacts sont conservés selon
les choix effectués. Comme à l'import JSON, exclure explicitement une échéance
d'assurance empêche sa recréation si aucune autre fiche ne couvre le même contrat
et le même mois. Choisir **Prévu** pour une échéance
générée désactive sa validation automatique ; des choix contradictoires bloquent la fusion.

Une absence n'est pas interprétée comme une suppression et un nom identique ne suffit
pas à réunir deux fiches. Le classement actif ou corbeille d'une même fiche est un
choix explicite. Les conflits et les liens invalides doivent être résolus avant envoi.
La fusion porte uniquement sur les deux copies présentées : le garage de cet appareil
et la version Drive sélectionnée. Elle produit une nouvelle révision complète reliée
à ces deux sources, sans les réécrire. S'il existe d'autres branches concurrentes,
elles restent à comparer et à fusionner séparément. Ce choix guidé ne déduit pas
automatiquement les intentions à partir d'un ancêtre commun.

Les dossiers partagés, les Drives partagés et les dossiers appartenant à un autre
compte sont refusés. Les fichiers restent visibles dans
Mon Drive. Les dossiers dev, main et les origines locales sont séparés par une
empreinte de l’URL de publication. Un export/import JSON permet un transfert
explicite entre environnements.

## Synchronisation et reprise

- Contrôle toutes les 15 secondes pendant que la page est visible, au retour de
  focus ou du réseau, et après une pause de 1,5 seconde suivant un enregistrement.
  Ce n’est pas une connexion push ni une tâche exécutée quand la PWA est fermée.
- Le jeton d’accès ne vit qu’en mémoire. Sur le domaine de production, la session
  du Worker peut renouveler le jeton automatiquement au retour dans Garapp.
  Un consentement révoqué, une session expirée ou un changement de compte
  suspend les transferts et demande une nouvelle connexion. Le mode manuel
  demande toujours un clic. Déconnecter Garapp conserve les fichiers et le
  lien au dossier ; les autres appareils gardent leurs propres sessions.
- Une modification locale est enregistrée comme une nouvelle révision issue de
  la dernière version confirmée. Les écritures concurrentes ne remplacent aucun
  fichier existant : leurs branches restent séparées. Les anciennes versions
  restent des fichiers JSON complets et directement importables.
- Un appareil sans modification locale peut recevoir une version courante unique
  et vérifiée. Le stockage local est confirmé avant de changer le garage affiché.
  Les formulaires, imports et transferts de fichier ouverts retardent cette reprise.
  La sélection du véhicule est locale à chaque appareil et ne crée pas de conflit.
- En cas de branches divergentes, comparer puis fusionner avec des choix explicites
  par champ, ou choisir un garage complet. Garapp valide le résultat, archive la copie
  locale sur Drive et crée une nouvelle révision reliée aux sources du choix. Une modification
  arrivée après la comparaison exige une nouvelle comparaison ; une écriture simultanée
  pendant le choix reste une branche concurrente. Si l'enregistrement local échoue,
  la nouvelle révision reste sur Drive et la copie ouverte reste inchangée.
- Un import JSON suspend l’automatisme Drive, même si l’import est ensuite annulé.
  Le lien reste disponible pour une comparaison avant réactivation.
- Les contrôles SHA-256 vérifient les fichiers transférés et détectent les
  modifications externes. Les relations entre révisions sont vérifiées avant
  toute reprise. Une version connue ou un parent supprimé, déplacé, partagé ou illisible
  bloque la synchronisation ; le garage local reste exportable.

Chaque révision conserve l'empreinte du fichier transféré et celle de son contenu
JSON enregistré, sans la sélection locale du véhicule. Cette seconde empreinte est
vérifiée sur le format sauvegardé, indépendamment des valeurs par défaut ou migrations
appliquées par le lecteur courant. Une évolution compatible du modèle ne doit donc
pas invalider une ancienne copie intacte. La création d'une révision calcule son
empreinte et son inventaire à partir du même contenu validé qui est envoyé.

Chaque JSON contient les pièces jointes en base64, les montants exacts et les
champs complémentaires. Il est limité à 512 Mio, avec 64 Mio par pièce jointe.
Les transferts de plus de 5 Mio utilisent une session reprenable par blocs de
8 Mio. Une interruption ne fait pas avancer le point de synchronisation confirmé.
La session de transfert n’est pas conservée après fermeture de la page : la
tentative suivante crée une nouvelle version. Les versions déjà terminées restent
disponibles. Les petits fichiers utilisent un envoi multipart.

## Confidentialité et limites

La bibliothèque Google est chargée en mode manuel si un client OAuth est
configuré, ou après sa configuration en développement. Le chargement seul
n’ouvre aucune fenêtre et n’autorise aucun accès Drive. En production,
Garapp demande une session au Worker uniquement depuis son domaine officiel ;
les requêtes utilisent un cookie protégé et ne mettent pas les réponses en cache.
Le Worker ne transmet au navigateur qu'un jeton d'accès court. Les jetons
sont envoyés dans l’en-tête Authorization aux seuls
endpoints HTTPS Drive autorisés, sans cache navigateur. Ils ne sont jamais ajoutés
aux JSON, aux préférences persistantes ni au cache du service worker. Les appels
Google, les sauvegardes et les documents sont hors du cache statique de la PWA.

Les fichiers et leurs métadonnées restent privés selon les droits Drive. Garapp
n’ajoute pas de chiffrement de bout en bout. Chaque révision complète compte
dans le quota Drive ; il n’y a ni déduplication ni suppression automatique. Éviter
de supprimer individuellement les ancêtres d’un dossier encore synchronisé.
L’application ne parcourt pas plus de 10 000 fichiers dans un même dossier et
refuse un choix réunissant plus de 60 branches concurrentes. Elle s’arrête si une
liste est incomplète, au lieu d’en déduire que le garage est vide.

Les copies JSON externes restent nécessaires pour se prémunir des suppressions,
des erreurs de compte et des indisponibilités du fournisseur. Le nom du dossier
et les dates des versions ne remplacent pas la vérification du contenu.

## Vérifications

`npm test` utilise exclusivement des garages fictifs, un serveur Drive simulé et
des réponses OAuth simulées. Les scénarios couvrent les deux appareils, les
branches concurrentes, les restaurations, l’expiration et les refus de transfert.
Les essais Google réels nécessitent un client OAuth et deux appareils autorisés ;
ils doivent vérifier le choix du compte, le consentement limité, la connexion,
la reprise après fermeture, les documents et le comportement hors connexion.

Références officielles :

- [Google Identity Services — modèle par jeton](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [OAuth pour les applications Web avec accès hors ligne](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Configurer un client Web et sa politique CSP](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
- [Autorisations Drive et scope drive.file](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Transferts multipart et reprenables](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
- [Propriétés privées et limites](https://developers.google.com/workspace/drive/api/guides/properties)
