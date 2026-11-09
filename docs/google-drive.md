# Sauvegardes Google Drive

[Accueil du projet](../README.md) · [Format de sauvegarde](backup-format.md)

## Activer la connexion Web

Le site statique utilise Google Identity Services et l’API Drive v3 directement
depuis le navigateur. La connexion Google du navigateur est indépendante de tout
connecteur Google Drive employé par un outil de développement.

1. Créer un projet Google Cloud dédié à Garapp, puis activer **Google Drive API**.
2. Configurer Google Auth Platform : identité de l’application, audience et écran
   de consentement. En mode test, ajouter les comptes destinés aux essais.
3. Déclarer le seul scope demandé :
   `https://www.googleapis.com/auth/drive.file`.
4. Créer un client OAuth de type **Application Web**. Ajouter les origines JavaScript
   autorisées, sans chemin : `https://sinikebe.github.io` pour la publication GitHub
   Pages et, pour le serveur local, `http://localhost:4173` (ou l’origine réellement
   utilisée). Les origines de prévisualisation temporaires nécessitent leur propre
   entrée. Le flux popup par jeton n’utilise pas de redirection serveur.
5. Copier uniquement l’identifiant public se terminant par
   `.apps.googleusercontent.com`. En dev, le panneau **Sauvegardes → Configuration
   Google pour les essais en développement** permet de le mémoriser sur cet
   appareil. Ce réglage local est un dépannage pour les essais sans client
   d’application commun. Pour la connexion normale, configurer une seule fois
   le client de Garapp en renseignant l’entrée `dev` ou `main` de
   `public/assets/js/drive-config.js`, puis régénérer le bundle hors connexion avec
   `npm run build:pwa`. Un identifiant client n’est pas un secret ; un secret client,
   un jeton, un mot de passe ou un compte de service n’a aucune place dans ce dépôt.
6. Ouvrir les sauvegardes dans Garapp. La connexion se prépare automatiquement,
   puis un seul bouton **Se connecter à Google Drive** ouvre la fenêtre Google
   depuis un geste explicite. Google peut demander le choix du compte, une
   authentification et le consentement. Aucun jeton n’est demandé en arrière-plan.

Le client OAuth identifie l’application, pas une personne. Une fois l’identifiant
commun publié, les utilisateurs n’ont aucun projet Google Cloud ni identifiant
technique à saisir sur leurs appareils. Le réglage local de développement est
alors masqué et ses anciennes valeurs ne remplacent pas le client de l’application.

Aucune clé API, aucun backend, aucun compte de service et aucun refresh token
ne sont nécessaires. Un identifiant OAuth vide laisse l’option inactive ; les
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

Sur le premier appareil, connecter Google puis **Créer un nouveau dossier de
sauvegarde → Créer le dossier et sauvegarder ce garage**. L’envoi inclut tout le
garage et ses documents, jusqu’aux limites du format portable. L’automatisme est
initialement en pause et peut ensuite être activé pour ce dossier.

Sur le second appareil, ouvrir la même version publiée de Garapp, connecter le
même compte Google et sélectionner le dossier existant. Une première liaison ne
remplace rien : comparer une version, puis choisir **Sauvegarder puis utiliser la
version Drive**. La copie locale initiale est archivée avant tout remplacement.
Activer ensuite la synchronisation automatique si nécessaire. Si les deux garages
sont déjà identiques, une synchronisation les reconnaît après vérification.

Les dossiers partagés, les Drives partagés et les dossiers appartenant à un autre
compte sont refusés. Les fichiers restent visibles dans
Mon Drive. Les dossiers dev, main et les origines locales sont séparés par une
empreinte de l’URL de publication. Un export/import JSON permet un transfert
explicite entre environnements.

## Synchronisation et reprise

- Contrôle toutes les 15 secondes pendant que la page est visible, au retour de
  focus ou du réseau, et après une pause de 1,5 seconde suivant un enregistrement.
  Ce n’est pas une connexion push ni une tâche exécutée quand la PWA est fermée.
- Le jeton d’accès ne vit qu’en mémoire. L’expiration, la révocation ou un changement
  de compte suspendent les transferts. La reconnexion nécessite un clic ; aucune
  popup ne s’ouvre automatiquement. Déconnecter Garapp conserve les fichiers,
  le lien au dossier et le consentement Google des autres appareils.
- Une modification locale est enregistrée comme une nouvelle révision issue de
  la dernière version confirmée. Les écritures concurrentes ne remplacent aucun
  fichier existant : leurs branches restent séparées. Les anciennes versions
  restent des fichiers JSON complets et directement importables.
- Un appareil sans modification locale peut recevoir une version courante unique
  et vérifiée. Le stockage local est confirmé avant de changer le garage affiché.
  Les formulaires, imports et transferts de fichier ouverts retardent cette reprise.
  La sélection du véhicule est locale à chaque appareil et ne crée pas de conflit.
- En cas de branches divergentes, comparer puis choisir un garage complet.
  Garapp archive la copie locale, crée une révision de choix et garde les parents.
  Une modification arrivée après la comparaison exige une nouvelle comparaison ;
  une écriture simultanée pendant le choix reste une branche concurrente.
  Les champs ne sont pas fusionnés automatiquement.
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

La bibliothèque Google est chargée à l’ouverture du panneau de sauvegardes si
un client OAuth est configuré, ou après sa configuration en développement. Le
chargement seul n’ouvre aucune fenêtre et n’autorise aucun accès Drive. Les jetons
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
- [Configurer un client Web et sa politique CSP](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
- [Autorisations Drive et scope drive.file](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Transferts multipart et reprenables](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
- [Propriétés privées et limites](https://developers.google.com/workspace/drive/api/guides/properties)
