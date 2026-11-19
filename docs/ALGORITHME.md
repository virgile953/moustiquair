# L'algorithme de Moustiq'Air

Ce document explique, pas à pas, comment l'application transforme des
signalements de moustiques en carrés rouges sur une carte. Il est écrit pour des
élèves de troisième et ne suppose aucune connaissance de Next.js.

Le code correspondant se trouve dans `src/lib/geo/`. Les valeurs importantes
sont regroupées dans `src/lib/config/model.ts` :

| Paramètre           | Valeur par défaut | Rôle                                                             |
| ------------------- | ----------------- | ---------------------------------------------------------------- |
| Taille d'une maille | 10 m              | Précision du calcul scientifique                                 |
| Rayon d'influence   | 100 m             | Distance maximale prise en compte autour d'un signalement        |
| Fenêtre par défaut  | 30 jours          | Signalements pris en compte                                      |
| Seuil public        | 3 signalements    | Nombre minimal de signalements distincts pour publier une maille |

---

## 1. Le problème à résoudre

On dispose de plusieurs signalements, chacun étant un point sur la carte. On veut
répondre à une question simple :

> « Autour de quelles zones plusieurs personnes ont-elles observé des
> moustiques, et à quel point ces observations se recoupent-elles ? »

Un signalement n'est pas un comptage de moustiques. C'est une **observation
ponctuelle**. Le modèle construit donc un **indice relatif d'activité
d'observation** :

- plus plusieurs signalements sont proches, plus l'indice est élevé ;
- un signalement isolé influence une petite zone autour de lui ;
- l'absence de signalement ne prouve pas l'absence de moustiques.

Le résultat n'est ni une population de moustiques, ni une probabilité
d'infestation, ni une carte de risque sanitaire.

---

## 2. Pourquoi convertir les coordonnées GPS ?

Un GPS fournit une **longitude** et une **latitude** en degrés (système
EPSG:4326). En GeoJSON, l'ordre est toujours :

```text
[longitude, latitude]
```

Le problème est qu'un degré ne correspond pas à une distance fixe :

- un degré de latitude vaut environ 111 km partout ;
- un degré de longitude vaut environ 111 km à l'équateur, mais seulement environ
  73 km à la latitude du Val-d'Oise.

Calculer `sqrt(dx² + dy²)` directement en degrés donnerait donc une distance
fausse. Pour faire de la géométrie en mètres, on projette les points dans le
système **Lambert-93** (EPSG:2154), le système officiel français :

```text
(longitude, latitude)  --proj4-->  (x, y) en mètres
```

Les fonctions utilisées sont :

- `lonLatToLambert93()` : GPS vers mètres ;
- `lambert93ToLonLat()` : mètres vers GPS, pour produire du GeoJSON ;
- `distanceMeters()` : distance entre deux points GPS, après projection.

Chaque signalement est projeté **une seule fois** à l'enregistrement. Les
colonnes `projectedX` et `projectedY` évitent de refaire ce calcul à chaque
affichage de la carte.

---

## 3. Découper le territoire en mailles de 10 m

On utilise une grille infinie, ancrée à l'origine de Lambert-93. Chaque maille
est un carré de 10 mètres sur 10 mètres.

Pour un point projeté `(x, y)` :

```text
gridX = floor(x / 10)
gridY = floor(y / 10)
cellId = gridX + ":" + gridY
```

`floor` arrondit vers le bas (vers moins l'infini). Cela fonctionne aussi pour
des coordonnées négatives.

Le coin sud-ouest de la maille est :

```text
coinX = gridX × 10
coinY = gridY × 10
```

Son centre, utilisé pour les distances, est :

```text
centreX = coinX + 5
centreY = coinY + 5
```

Exemple : un point à `x = 1234, y = 5678` tombe dans la maille
`123:567`, dont le coin sud-ouest est `(1230, 5670)` et le centre
`(1235, 5675)`.

Comme la grille est toujours calculée de la même façon, une maille garde le même
identifiant après un rechargement de page ou un redémarrage du serveur.

---

## 4. Le poids d'un signalement selon la distance

Autour d'un signalement, on considère un rayon de **100 mètres**. Plus une
maille est loin, moins elle reçoit d'activité.

Pour une distance `d` en mètres et un rayon `R = 100` :

```text
poids(d) = max(0, 1 − d / R)²
```

Trois idées sont cachées dans cette formule :

1. `1 − d / R` vaut 1 au point d'observation et diminue linéairement jusqu'à 0
   à 100 m.
2. `max(0, …)` empêche d'obtenir un poids négatif au-delà du rayon.
3. le carré `²` accentue fortement la proximité : le poids chute vite quand on
   s'éloigne.

| Distance | Calcul          | Poids  |
| -------- | --------------- | ------ |
| 0 m      | `(1 − 0)²`      | 1,0000 |
| 25 m     | `(1 − 0,25)²`   | 0,5625 |
| 50 m     | `(1 − 0,50)²`   | 0,2500 |
| 75 m     | `(1 − 0,75)²`   | 0,0625 |
| 100 m    | `(1 − 1)²`      | 0,0000 |
| 130 m    | `max(0, −0,3)²` | 0,0000 |

Le rayon de 100 m est une **hypothèse pédagogique simplifiée**. Ce n'est pas une
barrière que les moustiques ne franchiraient jamais, ni une constante
biologique universelle.

---

## 5. Exemple complet avec deux signalements

Plaçons-nous dans un repère en mètres. Les mailles sont alignées sur la grille
de 10 m.

- Signalement **A** : centre de la maille 0, coordonnées `(5, 5)`.
- Signalement **B** : centre de la maille 2, coordonnées `(25, 5)`.
- Les deux points sont donc à **20 m** l'un de l'autre.

On regarde une ligne de mailles dont les centres sont en `y = 5`, avec
`x = 5, 15, 25, …`.

Pour chaque maille :

```text
score = poids(distance à A) + poids(distance à B)
```

| Maille | Centre x | Distance à A | Distance à B | Poids A | Poids B |      Score |
| ------ | -------: | -----------: | -----------: | ------: | ------: | ---------: |
| 0      |        5 |            0 |           20 |  1,0000 |  0,6400 | **1,6400** |
| 1      |       15 |           10 |           10 |  0,8100 |  0,8100 | **1,6200** |
| 2      |       25 |           20 |            0 |  0,6400 |  1,0000 | **1,6400** |
| 3      |       35 |           30 |           10 |  0,4900 |  0,8100 | **1,3000** |
| 4      |       45 |           40 |           20 |  0,3600 |  0,6400 | **1,0000** |
| 5      |       55 |           50 |           30 |  0,2500 |  0,4900 | **0,7400** |
| 6      |       65 |           60 |           40 |  0,1600 |  0,3600 | **0,5200** |
| 7      |       75 |           70 |           50 |  0,0900 |  0,2500 | **0,3400** |
| 8      |       85 |           80 |           60 |  0,0400 |  0,1600 | **0,2000** |
| 9      |       95 |           90 |           70 |  0,0100 |  0,0900 | **0,1000** |
| 10     |      105 |          100 |           80 |  0,0000 |  0,0400 | **0,0400** |
| 11     |      115 |          110 |           90 |  0,0000 |  0,0100 | **0,0100** |
| 12     |      125 |          120 |          100 |  0,0000 |  0,0000 | **0,0000** |

Observations :

- la maille 0 reçoit `1 + 0,64 = 1,64` ;
- la maille 1 reçoit deux contributions moyennes : `0,81 + 0,81 = 1,62` ;
- la maille 2 est symétrique de la maille 0 ;
- au-delà de 100 m d'un des deux points, ce point ne contribue plus ;
- la maille 12 ne reçoit rien : elle n'est pas stockée dans le résultat ;
- un score supérieur à 1 est normal. C'est une somme, pas une probabilité.

La maille située à gauche (centre `x = −5`) aurait le même score que la
maille 3, par symétrie.

---

## 6. Additionner plusieurs signalements

Pour une maille `c` :

```text
activité(c) = SOMME des poids(distance(signalement_i, centre(c)))
             pour tous les signalements validés i
```

On **additionne** les contributions et on ne divise pas par le nombre de
signalements. Pourquoi ? Parce que plusieurs observations indépendantes au même
endroit constituent une information plus forte qu'une seule observation. Diviser
effacerait l'effet du recoupement.

Le nombre de moustiques déclaré est conservé comme information, mais il ne
multiplie pas le score. Une estimation manuelle « plus de 10 » est trop incertaine
pour donner automatiquement cinq fois plus de poids qu'une observation de « 1 ».

Le score final dépend donc :

- des moustiques réellement observés ;
- du nombre de personnes qui ont observé et signalé ;
- de la qualité de leurs identifications ;
- de la couverture du quartier par les observateurs.

C'est pour cela qu'on parle d'**activité d'observation relative**, et non de
densité de moustiques.

---

## 7. Ne calculer que les mailles utiles

On pourrait parcourir toutes les mailles de la commune pour chaque signalement.
Ce serait inutile : un signalement n'influence que les mailles situées à moins de
100 m.

Algorithme pour un signalement :

1. projeter le signalement en Lambert-93 ;
2. calculer la boîte englobante de rayon 100 m autour de lui ;
3. en déduire les indices `gridX` et `gridY` minimaux et maximaux ;
4. parcourir uniquement les mailles de cette boîte ;
5. calculer la distance entre le signalement et le **centre** de chaque maille ;
6. ignorer la maille si la distance est supérieure ou égale à 100 m ;
7. calculer le poids et l'ajouter dans une table `Map<cellId, maille>`.

Une maille située exactement à 100 m reçoit un poids nul. Elle n'a donc pas
besoin d'être conservée.

Le résultat est stocké dans une `Map` pour éviter les doublons : toutes les
contributions qui concernent la même maille sont additionnées au même endroit.

---

## 8. Fenêtre temporelle

L'interface propose :

- 7 derniers jours ;
- 30 derniers jours (valeur par défaut) ;
- 90 derniers jours ;
- toute la période.

Le filtrage utilise la **date d'observation** choisie par l'utilisateur, pas la
date d'insertion en base. Les dates affichées sont en Europe/Paris ; les
horodatages stockés sont en UTC. Une date sans heure est enregistrée à 12:00,
heure de Paris, puis convertie en UTC. Cela évite qu'une observation change de
jour à cause du décalage horaire.

Cette version utilise une **fenêtre dure** : un signalement est inclus ou exclu.
Il n'y a pas de décroissance progressive avec l'âge. Le code est organisé pour
permettre d'ajouter plus tard une pondération temporelle.

Seuls les signalements **validés** par un enseignant sont utilisés. Les
signalements en attente ou rejetés ne contribuent jamais.

---

## 9. De l'indice brut à la couleur

Les scores bruts peuvent dépasser 1. Si on les plafonnait tous à 1, deux zones
très différentes auraient la même couleur. On utilise donc une normalisation
visuelle :

```text
intensité = 1 − exp(−score / 1,5)
```

Propriétés :

- `score = 0` donne une intensité de 0 ;
- une augmentation du score augmente toujours l'intensité ;
- l'intensité reste comprise entre 0 et 1 ;
- les petits scores restent visibles, mais les très grands scores sont compressés
  pour ne pas saturer la carte.

L'échelle `1,5` est **fixe** pour une configuration donnée. Elle ne dépend pas du
viewport : la même activité brute garde la même couleur quand on déplace la
carte.

Cette étape est uniquement visuelle. Elle ne modifie ni le score, ni le rayon,
ni le calcul scientifique.

Les seuils d'affichage (faible, modéré, élevé) sont eux aussi fixes et
documentés. Ce sont des repères de lecture, pas des niveaux de risque sanitaire.

---

## 10. Résolutions d'affichage et niveaux de détail

La grille scientifique reste toujours de **10 m**. À certains niveaux de zoom,
dessiner toutes les mailles de 10 m serait inutile et coûteux. L'API renvoie donc :

- zoom faible : mailles d'affichage de **100 m** ;
- zoom moyen : mailles de **50 m** ;
- zoom élevé : mailles de **10 m**.

Les mailles d'affichage ne sont pas recalculées avec un autre rayon. Elles sont
calculées à partir des mailles scientifiques de 10 m.

Pour une maille d'affichage de 100 m, on fait la moyenne des **100** mailles de
10 m qu'elle contient, y compris celles qui ont un score nul :

```text
scoreAffichage = somme des 100 scores de 10 m / 100
```

Pour une maille de 50 m, on moyenne **25** sous-mailles. Inclure les zéros est
essentiel : sinon, une zone avec deux petits carrés actifs paraîtrait aussi
intense qu'une zone entièrement active.

Le rayon d'influence de 100 m ne change jamais avec le zoom.

---

## 11. Confidentialité

Une maille publique n'est renvoyée que si **au moins 3 signalements distincts**
y contribuent. Ce seuil est appliqué sur le serveur, avant l'envoi du GeoJSON.

Conséquences :

- un signalement isolé ne peut pas être localisé en lisant la réponse publique ;
- une maille supprimée ne révèle ni son score, ni son intensité, ni sa position ;
- les propriétés publiques sont limitées à l'identifiant de maille, au score
  arrondi, à l'intensité, au niveau, au nombre de signalements contributeurs et à
  la résolution affichée.

La vue enseignante (`view=full`) montre toutes les mailles, y compris celles qui
sont sous le seuil. Elle nécessite une session serveur et ne doit pas être
projetée en classe avec des positions privées.

---

## 12. Pseudocode

Le pseudocode suivant décrit le calcul complet, sans dépendance à Next.js.

```text
CONSTANTES
  TAILLE = 10 m
  RAYON = 100 m
  SEUIL_PUBLIC = 3

FONCTION projeter(longitude, latitude)
  RETOURNER proj4(EPSG:4326 -> EPSG:2154, longitude, latitude)

FONCTION indiceMaille(x, y)
  gridX = floor(x / TAILLE)
  gridY = floor(y / TAILLE)
  RETOURNER (gridX, gridY)

FONCTION centreMaille(gridX, gridY)
  RETOURNER (gridX * TAILLE + TAILLE / 2,
             gridY * TAILLE + TAILLE / 2)

FONCTION poids(distance)
  SI distance >= RAYON ALORS RETOURNER 0
  RETOURNER (1 - distance / RAYON)²

FONCTION calculerActivite(signalements, periode, bbox)
  mailles = nouvelle Map()

  POUR CHAQUE signalement DANS signalements
    SI signalement.statut != "validé" ALORS CONTINUER
    SI signalement.date < debutPeriode ALORS CONTINUER
    SI signalement hors de bbox + marge ALORS CONTINUER

    (sx, sy) = signalement.projete

    POUR gridY DE floor((sy - RAYON) / TAILLE)
             À floor((sy + RAYON) / TAILLE)
      POUR gridX DE floor((sx - RAYON) / TAILLE)
               À floor((sx + RAYON) / TAILLE)

        (cx, cy) = centreMaille(gridX, gridY)
        d = distance((sx, sy), (cx, cy))

        SI d >= RAYON ALORS CONTINUER

        id = gridX + ":" + gridY
        maille = mailles.obtenirOuCreer(id)
        maille.score += poids(d)
        maille.signalements.ajouter(signalement.id)
        maille.dateMax = max(maille.dateMax, signalement.date)

  RETOURNER mailles

FONCTION publier(mailles)
  resultat = []

  POUR CHAQUE maille DANS mailles
    SI maille.score <= 0 ALORS CONTINUER
    SI maille.centre hors de la commune ALORS CONTINUER
    SI maille.signalements.taille < SEUIL_PUBLIC ALORS CONTINUER

    intensite = 1 - exp(-maille.score / 1.5)
    resultat.ajouter({
      cellId: maille.id,
      score: arrondir(maille.score, 3),
      intensity: arrondir(intensite, 4),
      contributingReports: maille.signalements.taille
    })

  RETOURNER resultat
```

Le vrai code trie les signalements par identifiant avant de les additionner et
trie les mailles de sortie. Cela garantit que deux exécutions avec les mêmes
données produisent exactement le même résultat.

---

## 13. Complexité

Notons :

- `S` le nombre de signalements validés dans la fenêtre ;
- `k` le nombre de mailles candidates autour d'un signalement ;
- `N` le nombre de mailles actives dans la zone demandée.

Avec une maille de 10 m et un rayon de 100 m :

```text
k ≈ π × R² / TAILLE²
  ≈ 3,14 × 100² / 10²
  ≈ 314
```

En pratique, **305** centres de mailles tombent strictement à moins de 100 m
d'un point placé au centre d'une maille. Le nombre exact peut varier de quelques
unités selon la position du point dans sa maille. C'est ce que vérifie le test
automatisé.

Le calcul principal est donc :

```text
O(S × k) = O(S × 305)
```

On ne parcourt jamais toutes les mailles de la commune pour chaque signalement.
La recherche en base est également limitée par le statut, la date et une
boîte englobante projetée, avec une marge de 100 m.

Le stockage des mailles actives est en `O(N)`. Le tri final est en
`O(N log N)`. Pour l'affichage en 100 m, chaque maille d'affichage moyenne 100
sous-mailles, ce qui reste proportionnel au nombre de mailles affichées.

Avec quelques centaines ou milliers de signalements et un seul serveur, ces
ordres de grandeur sont largement suffisants. Le projet n'utilise ni worker, ni
cache distribué, ni traitement parallèle.

---

## 14. Ce que le modèle ne dit pas

Il est essentiel de distinguer :

| Ce que la carte montre                           | Ce que la carte ne montre pas           |
| ------------------------------------------------ | --------------------------------------- |
| Des observations humaines validées               | Un recensement exhaustif des moustiques |
| Un recoupement géographique de signalements      | Une probabilité calibrée d'infestation  |
| Une activité relative                            | Un niveau de risque sanitaire           |
| Une zone où des habitants ont regardé et signalé | Une zone où personne n'a regardé        |

Une zone blanche peut contenir des moustiques. Une zone rouge peut simplement
contenir plus d'observateurs. Le modèle est un outil pour poser des questions et
comparer des périodes, pas une vérité biologique.

---

## 15. Où lire le code

| Fichier                       | Contenu                                             |
| ----------------------------- | --------------------------------------------------- |
| `src/lib/geo/projection.ts`   | Projection EPSG:4326 ↔ EPSG:2154 et distances       |
| `src/lib/geo/grid.ts`         | Mailles, identifiants, centres et polygones GeoJSON |
| `src/lib/geo/influence.ts`    | Poids quadratique et agrégation des scores          |
| `src/lib/geo/intensity.ts`    | Normalisation visuelle et niveaux d'affichage       |
| `src/lib/geo/boundary.ts`     | Appartenance d'un point à la commune                |
| `src/lib/activity-service.ts` | Requêtes SQL, seuil public et GeoJSON               |
| `src/lib/config/model.ts`     | Toutes les hypothèses du modèle                     |
| `tests/influence.test.ts`     | Vérification des valeurs du poids et des sommes     |

Pour modifier une hypothèse scientifique, changez d'abord la constante dans
`src/lib/config/model.ts`, puis relancez `bun test`. Les tests indiquent
immédiatement quelles valeurs doivent être mises à jour.
