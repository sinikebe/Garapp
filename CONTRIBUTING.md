# Contribuer à Garapp

Une proposition doit décrire le problème rencontré, le comportement attendu et
les étapes pour le reproduire. Les captures et exemples doivent être fictifs ou
expurgés de toute information privée. Ne joindre aucun export réel de garage.

Toute PR de changement cible d'abord `dev`. Une proposition doit rester centrée
sur son objectif, avec un titre et des commits courts décrivant le changement.
Les corrections fonctionnelles doivent inclure un test reproduisant la régression
lorsque possible. Après revue et CI réussie, la fusion dans `dev` ne demande pas
d'accord de production.

`main` accepte uniquement une PR depuis la branche `dev` du même dépôt, après
test de la preview et accord explicite du responsable pour cette promotion.
Ne pas fusionner de branche de fonctionnalité directement dans `main`, ni
contourner cette promotion par un push direct.

Avant de proposer des changements :

1. Lire les [consignes du dépôt](AGENTS.md) et le [guide de développement](docs/development.md).
2. Préserver la lecture des anciennes sauvegardes et les propriétés JSON inconnues.
3. Régénérer le bundle hors connexion avec `npm run build:pwa` après toute modification de `public/`.
4. Exécuter `npm run check` et vérifier les interfaces touchées sur écran large et étroit.
5. Mettre à jour la documentation du comportement modifié.

Les fixtures doivent être synthétiques. Une migration, une correction de stockage
ou un changement d'import doit être accompagné de vérifications sur les anciens
formats, les documents intégrés, les montants exacts et les cas d'échec.

Les détails de validation, la structure du code et la publication sont regroupés
dans le [guide de développement](docs/development.md).
