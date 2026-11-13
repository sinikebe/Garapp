# Anciennes adresses GitHub Pages

Les entrées `https://sinikebe.github.io/Garapp/` et
`https://sinikebe.github.io/Garapp/dev/`, y compris leurs `index.html`, redirigent
vers `https://garapp.siniverse.cc/`. Les deux anciennes versions utilisent cette
destination de production. Les fragments des six sections de navigation sont
conservés ; les paramètres d’URL et les fragments inconnus ne sont pas transmis.
Sans JavaScript, un lien HTML permet de continuer vers la même adresse.

## Retrouver les données locales

Le stockage du navigateur appartient à son origine : le nouveau domaine ne peut
pas lire les garages enregistrés sur `sinikebe.github.io`. La redirection ne
transfère ni ne supprime les données, les documents ou les copies de récupération.
Les anciens garages principal et dev restent distincts.

Pour récupérer une copie, ouvrir dans le navigateur et le profil qui la contient :

- [Ancien garage principal](https://sinikebe.github.io/Garapp/recovery.html).
- [Ancien garage dev](https://sinikebe.github.io/Garapp/dev/recovery.html).

Cette page conserve l’application et ses ressources à leur base historique afin
d’utiliser le même stockage. Dans **Outils → Sauvegardes**, télécharger le garage
complet ; télécharger aussi les copies de récupération souhaitées avec les outils
existants. Ouvrir ensuite [Garapp](https://garapp.siniverse.cc/) et importer les
fichiers. Un dossier Drive déjà sauvegardé peut être retrouvé avec le même compte
et le même projet OAuth ; cela ne remplace pas les modifications uniquement locales.
L’application de récupération est une copie de la branche correspondante au moment
de la publication ; conserver un export externe avant d’y modifier des données.

Un service worker installé peut afficher une dernière fois son ancienne copie
hors connexion. Le script de transition prend ensuite le contrôle et retire
uniquement son propre enregistrement. Recharger ou rouvrir la page en ligne pour
recevoir la redirection. Les formulaires déjà ouverts ne sont pas rechargés de
force. Aucun cache, aucune base IndexedDB ni aucune préférence locale n’est effacé,
y compris ceux des autres applications sur la même origine. Une connexion est
nécessaire pour charger la redirection et les outils de récupération publiés.

## Publier les redirecteurs

`npm run ci:pages` est l'adaptateur du workflow Pages commun. Il reçoit les
checkouts main/dev dans `SINIVERSE_PAGES_MAIN_SOURCE` et
`SINIVERSE_PAGES_DEV_SOURCE`, et un chemin de sortie neuf dans
`SINIVERSE_PAGES_OUT`, hors des deux sources. Il appelle le générateur existant
`scripts/prepare_legacy_pages.py`, réservé à l’artefact GitHub Pages. Celui-ci utilise
les ressources de chaque branche pour `recovery.html`, puis remplace uniquement
l’index et le service worker de l’artefact par les fichiers de transition.
`public/`, le build Cloudflare et les ressources du Worker ne sont pas modifiés.

Le workflow Pages actif s’exécute depuis `main` et récupère son outillage depuis
`main`. Fusionner une proposition dans `dev` ne suffit donc pas : le générateur,
ses modèles et le workflow doivent également être promus dans `main` par une PR
de publication. Préserver les commits propres à chaque branche lors de cette
promotion. Les deux révisions assemblées doivent avoir une CI de push réussie ;
le workflow vérifie leurs HEAD avant publication et utilise ces résultats sans
répéter les suites de tests. Lancer ensuite
**Pages** depuis `main`, ou laisser une CI de push réussie le déclencher.
Les deux entrées sont publiées ensemble, sans changement Cloudflare ni DNS.

Vérification locale, avec un dossier de sortie inexistant :

```sh
python3 -m unittest discover -s test -p 'legacy_pages_test.py'
node --test test/legacy-pages.test.mjs
python3 scripts/prepare_legacy_pages.py --source . --output /tmp/garapp-legacy --branch main
```

Conserver ce workflow et les fichiers `sw.js` de transition tant que les anciennes
adresses sont utilisées. Après fusion, supprimer la branche de travail.
