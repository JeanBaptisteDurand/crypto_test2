# BRIEF — PonsFund · le coffre qui partage

> Version du 2026-09-06. Chaîne : Robinhood Chain (répétition sur base-sepolia). Déploiement : Clanker via le kit.
> Remplace la v2 archivée dans `docs/examples/ponsfund-brief-v2.md` : la direction passe d'un coffre-fort abstrait
> institutionnel à **Keystone**, la mascotte fournie. La v2 ne fait plus autorité.

---

## 0. Le projet en trois lignes

**PonsFund** est un fonds de lancement sur Robinhood Chain. Chaque token lancé via PonsFund verse la part créateur de ses fees de swap dans **un coffre commun**. Les détenteurs de `$PONSFUND` se partagent ce coffre **toutes les 24 h**, au pro rata, et chaque distribution est lisible sur l'explorer.

*Pons* = pont en latin. Le coffre est la marque, le pont est la mécanique : le lien entre chaque lancement et les gens qui détiennent.

---

## 0 bis. Verrouillé — ne pas modifier sans demande explicite

Cette section prime sur toute autre. La hero et la palette ont été validées écran par écran ; les skills
suivants (`/da-brief`, `/build-sections`, `/ship`, `/launch-token`) **ne doivent rien y changer**.

### Palette — figée (tirée de `assets/user/inspi1.jpg` / `inspi2.jpg`, 2026-09-07)

`bg #3a2a1c` · `fg #fff1cf` · `accent #5cc45c` · `accent2 #f7bb3d` · `accent3 #6bb2d9` · `muted #cba982`

**`accent3` est la couleur de l'interactif** (demandée le 2026-09-07) : tout ce sur quoi on peut cliquer
est dessiné dedans — bouton secondaire, liens du header, marqueur et bascule de la FAQ, cartes de la
communauté, tuiles de la bande, puce d'adresse, survol des panneaux. C'est le **complémentaire du brun**
du fond (teinte 30° → 205°, le ciel des images d'inspiration), et c'est la seule couleur qui sort du
registre chaud, exprès : un panneau brun qui s'éclaire en brun ne dit pas qu'il s'est passé quelque chose.
5,89:1 sur le fond, et le texte du fond passe à 5,89:1 dessus. **Cela lève l'interdit « pas de quatrième
couleur » de §9**, sur décision de l'utilisateur.

Les deux images d'inspiration fournies par l'utilisateur — le village RPG en pixel art et Keystone dans son
coffre — ont été quantifiées : bois `#a84633`/`#996451`, feuillage et gemme verts, pièces `#e39a4f`, ciel
`#5299c7`, parchemin `#fef2d8`. La palette retenue garde **le bois, le parchemin, le vert feuille et l'or**
et laisse le bleu du ciel au fond de la hero (l'image), pour ne pas ouvrir une quatrième couleur.

Le fond est **plus clair et plus brun** que les versions précédentes (`#14101a` violet, puis `#33291a`
olive) : l'utilisateur a demandé trois fois de suite moins sombre et plus brun/vert. Contrastes mesurés sur
`bg` : fg 12,3:1 · accent2 7,9:1 · accent 6,2:1 · muted 6,2:1 — et sur le rendu réel de la hero, texte
composé sur le fond animé : tagline 12,8 · points 11,2 · chip 7,3 · liens du header 5,8.

*Historique : palette « tropicale » (bleu océan, teal à 3,2:1) écartée ; palette violette `#14101a`
écartée ; palette olive `#33291a` jugée « trop grise / verte ».*

### Typographie et chrome — arcade, figés

- **Polices** : `Bricolage Grotesque` (display), `Inter` (corps), `JetBrains Mono` (chiffres et adresses),
  et **`Pixelify Sans` en police pixel**, qui porte tout le chrome : wordmark, titres de section, eyebrows,
  labels, boutons, navigation, boîtes de dialogue.
- *Historique : `Silkscreen` a été essayée à sa place (ses chiffres sont nets) puis **écartée à la demande
  de l'utilisateur** — Pixelify a le dessin qu'il veut. Les règles ci-dessous sont ce qu'il faut respecter
  pour que ce choix reste lisible.*
- **Trois choses ne vont jamais dans la police pixel**, parce que Pixelify dessine plusieurs signes de la
  même façon :
  1. **les chiffres** — son `2` est son `8` (« Every 24 hours » se lisait « Every 84 hours ») : compte à
     rebours, valeurs du coffre, badges numérotés et la supply sont en mono ou en display. Les numéros de
     quête sont en **chiffres romains** (QUEST I / II / III), qui n'ont pas ce problème et sont plus RPG ;
  2. **le `Z` et le `B` capitales** — même dessin que le `8` : « Zero gatekeeping » se lisait « Bero
     gatekeeping » à 48 px, « 100B » se lisait « 1008 ». La copy en pixel s'écrit sans capitale `Z` ;
  3. **les capitales tout court** : plus de `text-transform: uppercase` sur le chrome. « ROBINHOOD CHAIN »
     se lisait « ROGINHOOD CHAIN ». En casse de phrase, ces lettres sont sans ambiguïté — et c'est ainsi
     que les consoles qui ont inventé ce lettrage le composaient.
- **Jamais en dessous de 12 px** : le `C` capitale de Pixelify est presque fermé, et en dessous de 12 px il
  se confond avec un `O`. Tous les labels sont à 12 px minimum.
- **Aucune règle de `src/index.css` ne fixe de `font-size`.** Seul `.pixel-cap` (1,015em) subsiste, réservé
  au wordmark : il aligne la hauteur de capitale de Pixelify (130) sur celle de Bricolage (132) quand les
  deux moitiés se touchent. **À re-mesurer si la police pixel change encore.**
- **Radius `0`** partout. La profondeur vient des cadres et des ombres portées, jamais d'un arrondi.
- **Système de cadres** (`src/index.css`) : `.panel` (plaque à trois couches — filet clair intérieur, filet
  sombre extérieur, ombre portée nette de 6 px, scanlines dans le fond, coins entaillés par quatre carrés
  de la couleur de la page), `.pixel-frame` (le cadre seul), `.btn-pixel` (touche d'arcade, transitions en
  `steps()`, enfoncée à l'`:active`), `.hp-bar`/`.hp-cell` (jauge segmentée), `.crt-scan`/`.crt-glass`
  (balayage et bombé du tube), `.dialogue` (boîte de dialogue), `.sprite-idle` (bob deux images), `.caret`
  (curseur clignotant), `.pixel-img` (`image-rendering: pixelated`). `.pixel-rule` existe encore mais **ne
  sépare plus les sections** (retiré à la demande de l'utilisateur) : il ne sert qu'au filet du footer.
- **Le corps de page porte une grille de 4 px** à 3 % : sans elle, tout ce qui est sous la hero est un
  aplat brun uniforme, ce qu'une page pixel art ne peut pas être.
- `.glass` reste **teinté à la crème (`fg`), surtout pas à l'`accent`** : une teinte accent sur le verre
  met de la couleur sur chaque panneau du site à la fois.
- **Composants en registre jeu** : tokenomics en jauges de cellules (une part se compte, un arc de donut
  non), roadmap en **journal de quêtes** (QUEST I « Active », les suivantes « Locked », cases carrées), FAQ
  en **boîte de dialogue** (marqueur `▸`, curseur clignotant), compte à rebours en cellules frappées,
  mascotte en sprite qui respire à côté de l'adresse du coffre.
- **Tout `src/index.css` est dans `@layer components`.** Hors couche, ce fichier passait *au-dessus* des
  utilitaires Tailwind : un `font-size` dans `.font-pixel` avalait chaque `text-*` posé sur le même élément
  (un titre `text-4xl` sortait à 17 px) et un `position: relative` dans `.dialogue` annulait un `absolute`
  (la boîte de dialogue remontait en haut de la capsule). Dans la couche, l'utilitaire écrit dans le markup
  gagne toujours — la seule précédence prévisible.

### Les capsules de section — figées

Chaque section porte à sa droite une **capsule carrée** : l'illustration de la section, encadrée comme un
panneau de jeu, avec balayage CRT et une boîte de dialogue en bas.

- **Une image par section, nommée d'après elle** dans `assets/user/` (§4), servie depuis `public/sections/`.
- **Le pixelisation n'est pas un filtre** : l'art est servi à **256 px** et agrandi par le navigateur en
  `image-rendering: pixelated`. Le sous-échantillonnage se fait par **facteur entier en plus proche
  voisin** (1024→256 = 4, 2048→256 = 8, 1280→256 = 5), ce qui préserve la grille de pixels d'origine ; un
  filtre CSS sur une image pleine résolution ne ferait que la lisser. Chaque fichier pèse 20 à 32 Ko.
- **Une phrase par capsule**, la voix de Keystone, dans la boîte de dialogue :
  *How it works* « Keystone is waiting for you » · *The vault* « Help Keystone fill his vault » ·
  *How to buy* « Keystone drew you a map » · *Quest log* « Keystone knows where this goes ».
- **Affectation des images (révisée le 2026-09-07)** : `HowItWorks` → *How it works*, `TheVault` →
  *The vault* et la bande de fin, `HowToBuy` → *How to buy*, **`TokenEconomics` → *Quest log*** (et non
  *Tokenomics*), `WhereThisGoes` → **le fond de la hero**. **`Simple by design` (Tokenomics) n'a pas de
  capsule** : elle occupe toute la largeur.
- **Cadre de fenêtre RPG** (`.rpg-frame`) : bandeau doré de 4 px dans un bandeau sombre de 9 px, filet
  intérieur en creux, **quatre clous dorés aux angles** et ombre portée nette de 10 px. Pas
  d'`overflow-hidden` sur la figure : il rognerait les clous, qui sont dessinés en dehors de la boîte.
- **Elle arrive au scroll puis ne bouge plus.** Le `sticky` a été retiré : l'utilisateur veut l'entrée en
  scène, pas que l'image suive la lecture.
- **Les capsules alternent de côté** : *How it works* à gauche, *The vault* à droite, *How to buy* à
  gauche, *Quest log* à droite. Fait avec `order` et non l'ordre du DOM, pour que la copy reste lue en
  premier et empilée en premier sur mobile.
- **`focal`** (`object-position`) quand le sujet est décentré : le cadre est plus haut que large, donc une
  image carrée perd un sixième de chaque côté. `How to buy` est à `64%` (la carte est à la droite de
  Keystone) et `Quest log` à `74%` (le sablier). Mesuré en dessinant la fenêtre de recadrage sur l'image,
  pas au jugé.
- **Hauteur de la capsule = hauteur de la section**, par construction : la colonne fait 480 px et la
  figure prend toute la hauteur de la rangée (`h-full`). Un carré strict ne peut pas tenir cette promesse —
  son côté vaudrait la largeur de colonne, et aucune section ne fait 480 px de haut une fois qu'elle a un
  titre et une grille de cartes. La capsule prend donc la hauteur de la section et recadre l'art, sujet
  centré ; sous `lg` elle redevient un carré, empilé sous la copy. Le rythme vertical a été resserré pour
  aller dans le même sens (`py-14 md:py-16`, header `mb-8`, cartes en `p-5`, tuiles du coffre à trois de
  front) : les capsules tombent entre 625 et 751 px au lieu de 440 contre 1 259.
- `HowToBuy.webp` est **recadrée** pour retirer son propre cartouche « Location : Plaine Oubliée » : il
  tombait exactement où va la boîte de dialogue, et il est en français sur une page anglaise.

### La bande des launches — trois sources, dont la chaîne

La bande en bas de la hero n'est plus la liste écrite à la main dans `strip.items`. Elle fusionne trois
sources, dédupliquées par symbole, la première qui parle gagne :

1. **Les brouillons de ce visiteur** (`src/lib/drafts.ts`), en premier : qui vient d'en créer un veut le
   voir. `localStorage`, six maximum, marque redessinée à 96 px en plus proche voisin.
2. **La chaîne** (`src/lib/onchain.ts`). Un token lancé par PonsFund est un événement `TokenCreated` de la
   fabrique Clanker v4 dont le `tokenAdmin` est le wallet créateur — c'est exactement ce que pose
   `packages/launch/src/token.ts` (`tokenAdmin: creator`). La bande demande donc ces événements à
   l'explorateur et affiche ce qui revient. **Aucun backend, aucune liste à tenir.**
3. **`strip.items` du config**, pour ce qui n'est pas encore lancé.

**La chaîne passe avant le config** : un token annoncé « scheduled » à la main et déployé depuis est
« live », et des deux c'est la chaîne qui le sait.

Détails qui comptent :

- **Aucune dépendance ajoutée.** Les champs indexés de l'événement sont des adresses dans les topics, et
  les trois chaînes de caractères utiles (image, nom, symbole) sont décodées à la main depuis le blob de
  données — une tête de mots de 32 octets plus des offsets, c'est court à lire et ça ne périme pas avec une
  version de bibliothèque. `topic0` est écrit en dur avec sa signature en commentaire.
- **La source des logs est Blockscout, pas le RPC** : `eth_getLogs` sur toute la chaîne répond
  `log query timed out` (57 M de blocs), l'index de Blockscout répond en une requête. La lecture n'est donc
  activée que si `CHAINS[chain].explorerName === "Blockscout"` — c'est le cas de Robinhood Chain.
- **Elle ne part pas tant que `launch.creatorWallet` est l'adresse zéro** (§10) : aucune requête, aucune
  erreur, la bande affiche simplement le config. Le jour où le wallet est renseigné, elle s'allume seule.
- **Vérifié en vrai** : en pointant temporairement `creatorWallet` sur un wallet qui a réellement déployé
  deux tokens Clanker sur Robinhood Chain, les deux tuiles sont apparues dans la bande, nom et symbole
  décodés depuis les logs. Le test a été retiré, la valeur remise à zéro.
- Cache de 5 min en `sessionStorage`. Toute panne (rate limit, réseau, explorateur sans cette API) rend un
  tableau vide : la bande est une décoration sur une page qui doit s'afficher.
- Seules les images en `https://` sont chargées : ce champ est écrit par qui déploie le token, et
  `ipfs://` ou une data URL serait une façon de mettre n'importe quoi dans la hero.

### La section « Draft a launch » (#create)

Un bac à sable, pas un déployeur. Il écrit un brouillon dans le navigateur et la bande le reprend.
**Rien n'est déployé, aucun wallet n'est demandé, aucune transaction n'est envoyée, et la page de personne
d'autre ne change.** La copy le dit à trois endroits — le sous-titre, la tuile d'aperçu et l'étiquette
« Draft · only you see this » dans la bande — parce qu'un bouton « créer un token » qui ne fait rien
on-chain sans le dire serait un mensonge par omission.

C'est le choix explicite du propriétaire (2026-09-07) : créateur local maintenant, la bande alimentée par
la chaîne. Le vrai chemin est déjà câblé de l'autre côté : un token déployé via PonsFund apparaît tout
seul. Passer le bouton à un vrai déploiement Clanker demanderait un wallet connecté (nouvelles
dépendances), l'adresse du feeVault et $PONSFUND vivant — c'est la phase 3 de la roadmap, pas aujourd'hui.

### Le footer — « Keystone awaits in his vault »

**C'est le footer de la page** (déplacé le 2026-09-07 : c'était une bande entre la FAQ et Community). Il
reprend **exactement le traitement de la hero** : le même preset
`dither`, la même mécanique de paliers de transparence, une image différente (`public/sections/awaits.webp`,
tirée de `TheVault.webp`). Le titre est à gauche, dans la police pixel.

- **L'image est pré-recadrée au ratio de la bande** (1600×842 → 1,90:1, puis /4 en plus proche voisin) :
  le shader fait un `cover`, donc une source carrée coupait la tête de Keystone.
- **Le recadrage est décentré** (colonnes 0 à 1600 sur 2048) pour que Keystone soit à 64 % de la largeur :
  centré, il passait sous le titre.
- Fondus haut et bas vers `bg`. **Le fondu du bas monte à 52 %** de la bande, parce que le texte du footer
  s'y appuie : liens sociaux, puce d'adresse, filet, disclaimer, attribution du modèle 3D, copyright. Le
  titre garde le haut à gauche, Keystone garde le haut à droite.
- Il n'y a plus de `<Footer>` séparé : `src/components/sections/Footer.tsx` **est** cette bande.
- **Son eyebrow est « Can't wait to see you all »** (remplace « The vault », 2026-09-07) : la page dit au
  revoir là, et c'est Keystone qui parle.

### Build — `@source` obligatoire

`src/index.css` déclare `@source "./**/*.{ts,tsx}"`. La détection automatique de sources de Tailwind v4
s'est révélée **non déterministe** sur ce dépôt monté : `h-8`, utilisé seulement sur les logos de la bande,
disparaissait de la feuille de style d'un build à l'autre et l'image repartait à sa taille naturelle
(768 px). Le même correctif a été porté dans `template/src/index.css`.

### Répartition vert / or

L'or (`accent2`) porte le décor — eyebrows, cadres d'icônes, numéros de slot, `+` de la FAQ, jauges et
pourcentages du tokenomics, carré central des séparateurs, chiffres du compte à rebours. Le vert (`accent`)
reste la ponctuation : CTA principal, quête active, coches de la quête en cours, badges des points de la
hero.

### Fond — `shader` preset `dither`, l'image vue à travers le tramage

**L'image de la hero est `assets/user/WhereThisGoes.webp`** (la place du village), visible en permanence à
travers le dithering. Servie en `public/bg-hero.webp` (688×384, plus proche voisin facteur 2, 104 Ko).
*Elle a remplacé `background.jpg` le 2026-09-07 à la demande de l'utilisateur ; `background.jpg` reste dans
`assets/user/` mais n'est plus servie.*

- **Le tramage est rendu en niveaux de transparence** : chaque palier quantifié correspond à une opacité de
  l'image (0,12 → 0,78). Elle n'est donc **jamais absente ni jamais pleinement exposée** — c'est le tramage
  lui-même qui la fait apparaître et disparaître. Le champ dérivant, une zone traverse les paliers au fil du
  temps et l'image respire.
- **L'image ne bouge pas** : échantillonnée droite, sans déformation. Déplacer l'image donnait un effet de
  vague plaqué dessus, qui faisait cheap. Ce qui bouge, c'est le tramage.
- **Sur la copy et sous le header, la plage est compressée, pas coupée** (×0,30) : l'image y reste visible,
  simplement assez faible pour qu'on lise par-dessus.
- Retirer `design.backgroundImage` fait retomber le preset sur son champ procédural, sans autre changement.

**Contraste** : mesuré avec les **couleurs réelles du texte** (son opacité composée sur le fond) et sur
**cinq instants**, puisque le fond dérive. Là où du texte repose sur le fond : titre 8,0 · mono 6,8 ·
liens du header 5,7 · tagline 5,1.


Tramage ordonné (Bayer 4×4) sur un champ de flux dérivant, quantifié en 6 paliers, dessiné en gros pixels.
Registre risographe. Référence donnée : `aidesigner.ai/backgrounds/dither` — **reconstruit à partir de la
technique, pas copié** (Bayer, quantification et fbm déformé sont des briques standard).

- **L'aura dorée est ancrée sur le coffre**, elle ne dérive pas. Sa position (`u_focus`) est **mesurée dans
  la mise en page** et re-mesurée au redimensionnement, jamais écrite en dur : le site est un conteneur
  centré à largeur maximale, donc la fraction d'écran occupée par la colonne 3D change avec la taille de
  l'écran (0,71 à 1440 px, 0,62 à 2560 px). Une valeur fixe ne s'alignait qu'à une seule largeur.
- **Les vagues se cassent dessus** : le champ est poussé radialement vers l'extérieur à l'approche de
  l'aura, puis fondu dedans. Elles continuent de dériver — seule l'aura est fixe.
- **La rampe est portée par l'or**, l'accent n'est qu'une trace dans les paliers bas : lui donner une bande
  entière verdissait tout le cadre.
- **Le palier le plus clair est l'or, jamais la crème** : aucune bande n'approche la luminance du texte.
  Une première version montait au crème et rendait la hero illisible.
- **Rendu à `scale 0.55`** au lieu de 0.75 : l'effet est déjà dessiné par blocs, donc moitié moins de pixels
  pour des blocs à peine plus gros (42 → 47 fps mesurés).
- **Assombrissement du côté texte** `0.62` sur les 72 % de gauche.

Pire ratio sur du texte réel : **4,81:1**. Preset enregistré dans `shaders.ts`, dans `ShaderPreset`
(`src/lib/config.ts`) et dans l'enum du schéma — il est donc disponible pour tous les launches.

### La scène 3D de la hero — figée

Tout `src/components/hero/TokenScene.tsx` et le bloc `hero` de `launch.config.json`. Les constantes en tête
du fichier sont le résultat d'une résolution géométrique sous contraintes, **pas des valeurs à ajuster au
jugé** :

| constante | valeur | ce qu'elle garantit |
|---|---|---|
| `CHEST_FIT` | 22.6 | taille du coffre |
| `CHEST_CAMERA_Z` | 75.0 | cadrage : rien ne touche les bords |
| `CHEST_YAW` | −0.26 | le léger lacet vers la gauche |
| `ORBIT_COIN_SCALE` | 0.95 | taille des pièces |
| `RINGS` | r 13.7 / 17.1, inclinaisons 0° / 12°, vitesses 0.34 / 0.27 | anneaux bas, aucune traversée du coffre **ouvert** ; écart 3,40 > 2 × rayon de pièce (3,10) |
| `SLOTS` | 2 pièces par anneau, à une demi-orbite | aucune collision entre pièces |
| `FADE_MIN` | 0.1 | le fondu en profondeur |

**Elles sont couplées.** Changer l'une seule casse une garantie : agrandir une pièce la rapproche du coffre,
agrandir le coffre fait sortir les pièces du cadre, réduire un rayon les fait traverser le couvercle levé.
Toute modification demande de **re-résoudre l'ensemble puis de revérifier** (un tour complet du plus lent
des anneaux, coffre maintenu ouvert, et les bords du canvas).

### Animations et `prefers-reduced-motion` — décision du propriétaire

**Le site anime pour tout le monde**, y compris les visiteurs dont le système demande moins de mouvement.
Un seul point de contrôle : `RESPECT_REDUCED_MOTION` dans `src/lib/config.ts` — **le fond shader et la scène
3D le lisent tous les deux**. Ils avaient chacun leur propre test, d'où un fond figé sur Windows alors que la
scène 3D, elle, animait.

*Contexte : c'est ce réglage — actif par défaut sur certains PC Windows, absent sur macOS — qui donnait
« aucune animation ne fonctionne sur PC ». Il masquait un vrai bug, corrigé : `frameloop` en dépendait, donc
la scène cessait de se redessiner et même le survol restait sans effet.*

*Ce que ça coûte, pour mémoire : ce réglage sert aux personnes sujettes au mal des transports ou à des
troubles vestibulaires. Le passer outre leur impose l'orbite, la lévitation et la pulsation.*

### Assets — ne jamais régénérer

`logo.png` (Keystone), `mascot3d.glb` (le coffre), et les quatre `public/coins/*.png`. Le GLB servi est la
version compressée (651 Ko) : **un nouveau `import-assets` écrase `public/mascot.glb` avec l'original de
5,3 Mo**, il faut alors recompresser (§4).

---

## 1. Audience et ton

**Audience** : les premiers utilisateurs de Robinhood Chain, et les petits porteurs qui veulent une part des fees de lancement sans lancer de token eux-mêmes.

**Ton** : playful mais propre. Mignon et premium à la fois, jamais degen qui crie. La mascotte porte la chaleur, la copy porte la rigueur.

**Copy** : anglais, courte, factuelle. Le site explique le mécanisme en trois phrases et montre les chiffres du coffre. Pas de superlatif, pas de promesse.

---

## 2. Identité

- **Nom** : PonsFund — **Symbole** : `$PONSFUND`
- **Logo** : fourni, `assets/user/logo.png` (2048×2048, PNG). **Ne jamais le redessiner ni le regénérer.**
- **Mascotte : Keystone.** Un coffre au trésor chibi : tête ronde crème avec un petit nœud, corps en bois cerclé d'or avec des clous en losange, un **P émeraude brillant** sur la face avant, une pile de pièces d'or avec le glyphe ETH à ses pieds. Il sourit.
- Keystone est le symbole du token, l'avatar X, et la base de la bannière.
- **Monogramme et favicon** : le P émeraude seul, détouré du logo.

### Tagline — retenue

> **`A vault that shares. Every 24 hours, on-chain.`** (46 caractères)

Écartée : `Every launch fills the vault. Holders split it every 24 hours.` — plus explicite mais moins « marque ». La mécanique complète est portée par les 3 lignes mono de la hero, la tagline n'a pas à la répéter.

---

## 3. Direction artistique

**RPG pixel art 16 bits.** La référence n'est plus le logo seul : ce sont les deux images fournies par
l'utilisateur (`assets/user/inspi1.jpg`, `inspi2.jpg`), un village pixel art où Keystone se tient dans son
coffre. Le site en reprend le bois, le parchemin, le vert feuille et l'or.

**La palette, les polices, le radius et le système de cadres sont figés en §0 bis.** Ce qui suit ne les
répète pas ; ce sont les principes qui restent quand on ajoute une section.

- **Tout le chrome est bitmap** : titres, eyebrows, labels, boutons, navigation, dialogues. Le corps de
  texte reste en Inter, et les chiffres en mono ou display (voir §0 bis) — une police pixel sur un
  paragraphe de trois lignes n'est pas lisible, et sur un chiffre elle est ambiguë.
- **Le chrome est en casse de phrase**, jamais en capitales : voir §0 bis, c'est une contrainte de la
  police, pas un goût.
- **Chaque section porte sa capsule illustrée** à droite (§0 bis) et la page se ferme sur la bande
  « Keystone awaits in his vault », au même traitement que la hero.
- **Rien n'est arrondi.** La profondeur vient d'un filet clair, d'un filet sombre et d'une ombre portée
  nette, jamais d'un flou ni d'un arrondi.
- **Les transitions d'interface sont en `steps()`**, pas en `ease` : un survol qui glisse lit comme un
  bouton web, un survol qui saute d'un cran lit comme une entrée de menu. Les reveals au scroll gardent
  l'ease `[0.22, 1, 0.36, 1]` du kit.
- **Chaque composant emprunte sa forme à un objet de jeu** avant d'emprunter une forme web : jauge plutôt
  que donut, journal de quêtes plutôt que timeline, boîte de dialogue plutôt qu'accordéon.
- **Fond** : `shader` preset `dither` avec l'image du village (voir §0 bis). Le preset `aurora` des
  premières versions est abandonné.
- **Une seule couleur d'accent à la fois** : l'or (`accent2`) porte le décor — eyebrows, cadres d'icônes,
  numéros, pourcentages, jauges, séparateurs. Le vert (`accent`) reste la ponctuation : CTA principal,
  quête active, coches, badges de la hero.

### Hero

`composition: editorial-3d`.

- **Gauche** : chip « Robinhood Chain », titre, tagline, puis 3 lignes mono :
  1. la part créateur des fees part dans le coffre
  2. distribution toutes les 24 h
  3. tout est lisible on-chain
  puis le **chronomètre du prochain giveaway**, puis les CTA (« Launching soon » + **Follow on X**).
  **Pas d'adresse de contrat dans la hero** (retirée le 2026-09-06) : elle reste dans le footer.
  La **bande des launches est visible sans scroll** sur desktop — c'est ce qui contraint la hauteur du
  canvas 3D (`lg:h-[min(560px,58vh)]`) et les paddings de la section. Sur mobile elle reste sous la ligne
  de flottaison : le texte seul y occupe déjà tout l'écran (§10).
- **Titre** : « **Pons** » en or (`accent2`), « Fund » en crème. Le découpage est fait sur la casse interne
  du nom, pas écrit en dur.
- **Chronomètre** : lit `vault.firstPayoutAt` puis avance de `vault.cycleHours`. Sans date, il ne s'affiche
  pas du tout plutôt que d'inventer une horloge.
- **Droite** : le **coffre 3D** (GLB fourni, §4) qui **s'ouvre au survol**, entouré de **quatre pièces**
  frappées en orbite. Réglages verrouillés, voir §0 bis.

#### La pièce (le même die pour les quatre)

Or plaqué usé, registre « trésor » (référence donnée : Sea of Thieves). Le logo n'est pas plaqué en image
sur la face : il est **frappé en relief** (bump map tirée de l'illustration, recadrée sur sa boîte alpha)
dans le même métal que le listel. Métal réfléchissant (`metalness: 1`) éclairé par un environnement chaud
généré en canvas — aucun téléchargement, captures déterministes. **Tranche cannelée** : 84 cannelures
déplacées dans la géométrie, visibles en silhouette. **Usure procédurale** à graines fixes, donc identique
à chaque chargement : patine dans les creux, rayures fines, coups le long du bord, bande extérieure
dégarnie. Les couches d'usure sont générées **une fois** et partagées par les quatre pièces.

#### Les quatre pièces en orbite

Une par logo de `assets/user/` : Keystone, BTC, ETH en **or**, Robinhood en **argent**. Même design et même
taille pour toutes (`ORBIT_COIN_SCALE 0.95`, soit ~45 px à l'écran).

- **Deux anneaux, deux pièces chacun**, tenues à une demi-orbite d'écart : même rayon, même vitesse, donc
  leur écart ne change jamais et elles ne peuvent pas se rejoindre.
- **Non-collision garantie par construction** : deux pièces ne peuvent se toucher que si leurs distances au
  centre se rapprochent à moins de deux rayons de pièce ; des rayons espacés de plus que ça rendent le
  contact impossible quels que soient les plans, phases et vitesses.
- **Les anneaux sont bas** (inclinaisons 0° et 12°) : ils contournent la base et passent **derrière** le
  coffre au lieu de survoler le couvercle levé. C'est ce qui paie la taille du coffre (voir l'arbitrage
  ci-dessous).
- **Fondu en profondeur** : une pièce descend à 10 % d'opacité quand elle est derrière le coffre. Sans ça,
  elle se lit comme si elle glissait sous la base au lieu de passer derrière.
- **Halo et traînée** : chaque pièce porte un halo doré additif et trois « fantômes » en retard angulaire
  fixe sur son propre anneau — ils suivent donc le mouvement sans calcul par frame. Halo et traînée suivent
  le même fondu de profondeur que la pièce.
- **Le canvas déborde de sa colonne** (`lg:w-[121%] lg:ml-[-7%]`) : à la largeur de la grille, les pièces
  étaient coupées sur les bords gauche et droit. Le débordement se fait dans la gouttière de la page, la
  hauteur ne change pas, donc le coffre garde sa taille.
- Les pièces sont maintenues **face caméra** : à cette taille, elles ne sont lisibles que de face.

> **Arbitrage tranché (2026-09-06).** Les rayons dégagent le coffre **ouvert**, pas seulement fermé : le
> couvercle basculé monte à **0,84 × la largeur du coffre**. Une orbite qui le survole doit passer au-delà,
> ce qui obligeait le champ à contenir près de deux fois le coffre et plafonnait celui-ci à ~50 % de la
> largeur du canvas. **Choix retenu : les pièces passent derrière, pas au-dessus.** Le coffre est passé de
> 230 à ~330 px, sans aucune traversée, vérifié sur un tour complet coffre maintenu ouvert.

#### Le coffre

- **Droit** : aucun tangage ni roulis. Une seule rotation fixe, un léger lacet vers la gauche
  (`CHEST_YAW = -0.26`).
- **Ouverture au survol** : seule la première prise du clip est jouée, sa fin détectée au premier pic de
  rotation du couvercle. Le clip étant baké en coordonnées monde, il est joué en entier et un groupe
  stabilisateur annule le mouvement de la base — sinon tout le coffre bascule.
- **Lévitation** permanente, et **dérive vers le curseur** (translation + un soupçon de lacet, jamais de
  tangage ni de roulis) pour signaler qu'il est interactif avant qu'on le survole. Les deux amplitudes sont
  **proportionnelles à `CHEST_FIT`** : en unités fixes, elles deviennent invisibles dès qu'on change
  l'échelle de la scène.
- **Auréole pulsante** derrière lui en permanence : disque additif doré placé plus loin que la profondeur du
  coffre, donc occulté en son centre — il cerne la silhouette. Pulsation lente et ample.
- **Halo à l'ouverture** : lumière chaude à l'intérieur plus un disque additif que le coffre occulte, tous
  deux montant avec le couvercle, pour que la lueur sorte de l'ouverture au lieu de se poser sur l'image.
  Ce n'est pas du bloom : rien ne post-traite l'image.

- **Bas** : bande des launches.

### Ce qu'on ne fait pas

Pas d'overlay sombre sur la mascotte. Pas de dégradé sur le texte. Pas de bloom (post-traitement), pas de
chrome, pas de néon.
Pas de quatrième couleur.

> **Révision du 2026-09-06.** Le brief demandait des matières *mates*. L'utilisateur a demandé un rendu
> « plated gold » pour que la pièce lise comme une vraie pièce : le métal est donc réfléchissant. Cela ne
> rouvre ni le bloom ni le chrome.

---

## 4. Assets fournis

| Fichier | Rôle | État |
|---|---|---|
| `assets/user/logo.png` | Keystone, logo + avatar X + face de la pièce 3D | fourni, 2048×2048, **PNG alpha, déjà détouré** ✓ |
| `assets/user/mascot3d.glb` | le coffre 3D de la hero, ouvert au survol | fourni le 2026-09-06, 5,3 Mo, animé. **Original conservé** |
| `assets/user/BtcLogo.png` | pièce Bitcoin en orbite | fourni. Sa « transparence » était un **damier rasterisé** : détouré par saturation |
| `assets/user/EthLogo.svg` | pièce Ethereum en orbite | rasterisé en 1024. Nuances conservées : ce sont elles qui donnent les facettes du losange |
| `assets/user/RobinHLogo.svg` | pièce Robinhood en orbite, **en argent** | rasterisé en 1024, forcé en blanc (aplat unique → relief franc) |
| `assets/user/inspi1.jpg`, `inspi2.jpg` | **références de direction artistique** (village pixel art, Keystone dans son coffre) : la palette de §0 bis en est tirée | fournies le 2026-09-07 |
| `assets/user/HowItWorks.webp` | capsule de la section *How it works* | fournie le 2026-09-07, 1024² |
| `assets/user/TheVault.webp` | capsule de *The vault* **et** source de la bande de fin | fournie le 2026-09-07, 2048² |
| `assets/user/TokenEconomics.webp` | capsule de *Tokenomics* | fournie le 2026-09-07, 1280² |
| `assets/user/HowToBuy.webp` | capsule de *How to buy* (recadrée, voir §0 bis) | fournie le 2026-09-07, 1024² |
| `assets/user/WhereThisGoes.webp` | capsule du *Quest log* | fournie le 2026-09-07, 1376×768 |
| `public/sections/*.webp` | les versions servies : 256 px, plus proche voisin, facteur entier | dérivées — **ne pas les régénérer avec un rééchantillonnage lisse** |
| `public/mascot.glb` | la version servie | **651 Ko** (textures WebP 1024, gltf-transform). ⚠️ un nouveau `import-assets` l'écrase : recompresser |

Importé le 2026-09-06 → `public/token.png`, `assets.*` renseigné dans `launch.config.json`.
**Le fond est déjà transparent** (1,9 M pixels alpha sur 4,2 M) : rien à détourer, la pièce 3D et l'avatar X ne sont pas bloqués.

Couleurs réelles de la mascotte (mesurées hors zone transparente) : crème `#fdf6e0` 22 %, prune du trait `#201223` 15 %, bois `#bf705f` 15 %, prune-rouge `#59202d` 12 %, dorés `#f6dab1` / `#fee5bc`. La palette de §3 en est bien tirée.

**À dériver** (jamais à redessiner) :
- **Favicon / monogramme** : le P émeraude seul.
- **Bannière X** : Keystone agrandi à gauche sur le fond `#16111a`, une seule ligne de texte à droite, hors zone morte.

### Le coffre 3D — provenance et licence

*Treasure Chest Animation*, par **Matt Harris** (https://sketchfab.com/MattHarris86),
source : https://sketchfab.com/3d-models/treasure-chest-animation-9a0e32639f5b4b6eaed18532718c1085

> **Licence : CC-BY-4.0.** L'attribution est **obligatoire** et doit être **visible sur le site publié**.
> Ligne à mettre dans le footer, avant tout `/ship` :
> *« Treasure chest model by Matt Harris, CC BY 4.0. »* avec le lien vers le modèle.
> Le footer est hors du périmètre de `/build-hero` : **à faire dans `/build-sections`.**

Le modèle contient un rig et une animation unique `HarrisChestClips` de 5,4 s qui concatène plusieurs
prises : ouverture (0 → 0,767 s), refermeture, secousses, ouverture partielle. Seule la première prise est
jouée, sa fin détectée au premier pic de rotation du contrôleur `CTRL_Lid`.

**Ses pistes sont bakées en coordonnées monde** : pendant l'ouverture, `chest_base_g` — la base — tourne de
180° et se déplace de 137 unités. C'est le mouvement d'ensemble d'une démo tournante, pas une ouverture.
On ne peut donc pas filtrer les pistes par node : le clip entier est joué, et un groupe stabilisateur annule
la transformation de la base à chaque frame (mesurée relativement à sa pose à t=0). Il ne reste à l'écran
que le mouvement relatif : le couvercle qui s'ouvre.

Pas de vidéo.

---

## 5. Le site — sections dans l'ordre

**État au 2026-09-06** : hero et sections construites. `About` est devenu **How it works** (les quatre
temps du mécanisme), **The vault** et **Giveaway** ont été créés. La `Roadmap` est conservée bien que le
plan de §5 ne la liste pas : son contenu est réel et vient du config. **Giveaway ne s'affiche pas** tant que
`giveaway.enabled` est `false`, c'est-à-dire tant que le pot n'est pas tranché (§10).

1. **Hero** — voir §3, plus un countdown vers la première distribution et un teaser du giveaway.
2. **How it works** — les quatre temps : un token est lancé → sa part créateur remplit le coffre → 24 h → partage pro rata. Trois phrases, pas plus.
3. **The vault** — solde du coffre, prochaine distribution, nombre de porteurs. **Placeholders explicites tant que rien n'est live** (`vault.address: null` s'affiche en « not yet »).
4. **Bande des launches** — voir §8.
5. **Tokenomics** — supply Clanker par défaut, répartition de la part créateur des fees entre créateur et coffre.
6. **How to buy** — Robinhood Chain, le bridge, le DEX. Étapes numérotées, aucune projection.
7. **Giveaway** — part au pro rata, voir §5 bis.
8. **FAQ**
9. **Draft a launch** — le créateur de token local, voir §0 bis. Nav : « Make one ».
10. **Community** — lien X.
11. **Footer** — la bande « Keystone awaits in his vault » : liens sociaux, adresse du contrat, disclaimer,
    attribution, copyright. Voir §0 bis.

### 5 bis. Giveaway

**Mécanique : pro rata de la détention.** La part du giveaway qui revient à une adresse est égale à sa part de la supply détenue au snapshot. `x %` de la supply → `x %` du giveaway. Pas de tirage au sort, pas de gagnants désignés : tous les porteurs au snapshot reçoivent une part.

- **Snapshot** : bloc unique, annoncé à l'avance, hash publié une fois passé (`giveaway.snapshotBlock`).
- **Distribution** : une transaction, lisible sur l'explorer (`giveaway.payoutTx`).
- **Seuil minimum** : à définir — un plancher anti-poussière est recommandé pour éviter des milliers de transferts d'une valeur nulle *(voir §10)*.

**Copy anglaise, formulation à tenir** : « Your share of the giveaway equals your share of the supply. » Jamais « win », « earn », « reward ».

**Note d'implémentation** : le champ `giveaway.winners` du schéma (`docs/launch.config.schema.json`) suppose un tirage à N gagnants et **ne décrit pas un pro rata**. À l'écriture de la config il faudra soit y mettre le nombre d'adresses éligibles au snapshot (inconnu avant le lancement), soit assouplir le schéma. Décision à `/build-sections`.

---

## 6. Liens

- **X** : https://x.com/ponsfund
- **Telegram** : aucun pour l'instant.
- **Site** : `https://ponsfund.pages.dev` jusqu'à un domaine propre.

---

## 7. Launch

| | |
|---|---|
| **Répétition** | `base-sepolia`, dry run d'abord |
| **Production** | `robinhood` |
| **Wallet créateur** | ⚠️ **à fournir avant la prod** — jamais le burner |
| **feeVault** | activé, adresse ⚠️ **à fournir**. **100 %** de la part créateur des tokens de la plateforme y va |
| **Part des fees de $PONSFUND lui-même vers le coffre** | ⚠️ **à confirmer** (voir §10) |
| **Dev buy** | activé, petit montant |
| **Mcap initial** | défaut du kit (10 ETH) *(choix par défaut)* |
| **Date** | aucune. On lance quand la hero et la preview sont validées. `launchAt: null` |

Rappel kit : `--send` seulement après un dry run lu par l'utilisateur, et le mainnet exige la phrase `deploy mainnet PONSFUND` tapée en chat.

---

## 8. Autres tokens

Trois satellites, lancés **après** PONSFUND, sans compte X propre. Ils servent à animer la bande et à alimenter le coffre.

| slug | nom | symbole | statut au lancement |
|---|---|---|---|
| `ponsfund` | PonsFund | `PONSFUND` | **live** |
| `toll` | Toll | `TOLL` | upcoming |
| `troll` | Troll | `TROLL` | upcoming |
| `pontifex` | Pontifex | `PONTIFEX` | upcoming |

---

## 9. Interdits

**Mots** : `guaranteed`, `APY`, `rendement`, `yield`, tout prix ou projection de prix, `passive income`, `10x`.

**Visuels** : pas de logo ni de couleur Robinhood — on écrit « on Robinhood Chain », sans affiliation ni endorsement. ~~Pas de quatrième couleur~~ — **levé le 2026-09-07** : `accent3` (bleu ciel) est la couleur de l'interactif, voir §0 bis. Rien d'autre ne s'ajoute à la palette. Pas d'overlay sombre sur la mascotte. Pas de dégradé sur le texte.

---

## 10. Points ouverts

1. ~~Attribution CC-BY-4.0 du coffre~~ **fait** : dans le footer, avec les liens vers l'auteur et la licence.
2. ~~Poids du coffre~~ **fait** : 5,3 Mo → 651 Ko (`gltf-transform optimize`, textures WebP 1024). Draco
   volontairement écarté : son décodeur se télécharge depuis un CDN externe au chargement de la page.
3. ⚠️ **Date du premier giveaway** : `vault.firstPayoutAt` est provisoirement au **2026-09-13T18:00:00Z**,
   uniquement pour que le chronomètre de la hero soit visible. **Valeur à remplacer** : aucune date de
   lancement n'est arrêtée (§7). Mise à `null`, le chronomètre disparaît proprement.
4. **Adresse du wallet créateur** — avant toute prod. **Elle commande aussi la bande des launches** : la
   lecture on-chain filtre les événements `TokenCreated` sur ce wallet, donc tant qu'il vaut l'adresse zéro,
   la bande n'affiche que ce que le config liste à la main (§0 bis).
5. **Adresse du coffre** (`feeVault`) — avant toute prod.
6. **Le pot du giveaway** : la *mécanique* est fixée (pro rata, §5 bis), mais **la source et le montant ne le
   sont pas**. Deux lectures : (a) le giveaway *est* la première distribution du coffre, mise en avant — alors
   « Giveaway » et « The vault » disent la même chose et l'une doit disparaître ; (b) c'est un **pot séparé**,
   alimenté autrement que par les fees, versé en plus du premier cycle. Le teaser hero n'a de sens qu'en (b).
7. **Seuil minimum du giveaway** (`minHold`) : plancher anti-poussière, valeur à fixer.
8. **`giveaway.winners`** : champ du schéma incompatible avec un pro rata (§5 bis).
9. **Cadrage légal du giveaway** : une distribution pro rata sans tirage est plus simple qu'une loterie, mais
   reste à faire valider.
10. **Part des fees de $PONSFUND lui-même vers le coffre** : % exact à confirmer.
11. **Bug d'outil à connaître pour `/da-brief`** : `scripts/import-assets.py` quantifie le logo sans masquer
    l'alpha, donc `import.json → logoColours` annonce `#000000` à 43 % (les pixels transparents). Ne pas s'en
    servir : les vraies couleurs sont celles de §3 et §4.
12. **Outil : `scripts/shot.mjs` capture trop tôt** (1,8 s desktop, 1,5 s mobile) et rate régulièrement la
    scène 3D, qui met ~1,4 s à peindre. Les captures de la hero dans `.shots/` ont été prises avec une
    attente plus longue. Corriger l'outil (attendre que le canvas ait peint) est hors du périmètre de
    `/build-hero` ; à faire si l'on veut des captures fiables.
13. **Bande des launches sur mobile** : visible sans scroll sur desktop et sur écran court (1440×780),
    mais pas sur mobile (390×844) — le bloc de texte de la hero y occupe à lui seul plus d'un écran. La
    rendre visible demanderait de couper du contenu de la hero ; à arbitrer.
14. **Note de référence** : la bibliothèque mesure que les logos flat, 2 à 8 couleurs, PNG alpha ≥ 1000 px
    performent mieux. Keystone est une illustration rendue : choix assumé, la mascotte est la marque. Le
    facteur le plus fort (PNG alpha ≥ 1000 px) est déjà acquis.
