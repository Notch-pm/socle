-- ---------------------------------------------------------------------------
-- Étape « Communication usager » du paramétrage des démarches (2026-09-18)
--
-- Ce qu'une collectivité ÉCRIT POUR SES USAGERS à propos d'une démarche : durée
-- habituelle d'instruction, précision sur le public concerné, pièces demandées,
-- foire aux questions.
--
-- Le DESCRIPTIF n'est PAS ici : il remplit `user_description`, qui existe depuis
-- toujours, qui est déjà servie au portail (liste ET détail) et que jusqu'ici
-- aucun écran ne remplissait. Lui créer une clé JSONB voisine aurait fait deux
-- sources de vérité pour un même texte, et rien n'aurait dit laquelle fait foi
-- le jour où elles divergent.
--
-- ⚠️ INVARIANT : TOUT CE QUE PORTE CETTE COLONNE EST PUBLIC. C'est ce qui permet
-- de la servir TELLE QUELLE au portail usagers, sans whitelist clé par clé —
-- comme `form_schema` et `requester_config`. Rien de ce qui sert à INSTRUIRE
-- n'entre ici : cela vit dans `knowledge_base` (agent et IA) ou dans
-- `communication_config` (diffusion, et documents que l'agent produit), qui ne
-- traversent ni l'un ni l'autre. Le jour où l'on sera tenté d'y poser un réglage
-- interne, il faut lui trouver une autre maison.
--
-- ⚠️ NE PAS CONFONDRE avec `communication_config` (étape « Publication ») :
-- celle-là dit OÙ ET QUAND la démarche est proposée et CE QUE L'AGENT peut
-- produire ; celle-ci dit CE QUE L'USAGER LIT. Deux étapes voisines du stepper,
-- deux colonnes, deux publics.
--
-- ⚠️ TROISIÈME DURÉE DU MODÈLE. `input_duration_minutes` = combien de temps
-- l'usager met à REMPLIR (minutes, étape « Descriptif ») ; le bloc `delays`
-- ci-dessous = combien de temps la collectivité met à RÉPONDRE, avec son unité
-- explicite ; `communication_config.visibility.publicationStart/End` = entre
-- quelles dates la démarche est proposée. Aucune ne se déduit d'une autre.
--
-- ⚠️ DÉFAUTS VIDES, contrairement au bloc `visibility` de `communication_config`
-- dont les défauts sont ACTIFS : une colonne NULL veut dire « la collectivité n'a
-- rien écrit ». Lui inventer un délai ou une FAQ publierait en son nom ce qu'elle
-- n'a pas dit.
--
-- Nullable, additif : la RLS existante de `procedures` (écriture is_super_admin()
-- OR is_org_admin(organization_id)) couvre déjà cette colonne, aucune policy
-- supplémentaire n'est nécessaire.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. La colonne
-- ---------------------------------------------------------------------------
alter table public.procedures
  add column if not exists user_communication jsonb;

-- La base valide la FORME, pas le contenu : un bloc qui s'ajoute ne doit jamais
-- demander une migration (motif `is_valid_language_set`). Le parseur applicatif
-- (`src/features/procedures/userCommunication.ts`) reste tolérant bloc par bloc.
alter table public.procedures
  drop constraint if exists procedures_user_communication_object_check;
alter table public.procedures
  add constraint procedures_user_communication_object_check
  check (user_communication is null or jsonb_typeof(user_communication) = 'object');

comment on column public.procedures.user_communication is
  'Étape « Communication usager » : ce que la collectivité écrit POUR L''USAGER. Blocs : delays (processingTimeValue + processingTimeUnit — durée d''INSTRUCTION, à ne pas confondre avec input_duration_minutes, qui est la durée de SAISIE) ; audience (note — précision éditoriale qui NE FILTRE RIEN : les publics admis sont dans requester_config) ; attachments (items — pièces ANNONCÉES à l''usager, distinctes des champs attachment de form_schema, qui sont ce qu''il TÉLÉVERSE) ; faq (items — FAQ USAGER, distincte de knowledge_base.faq, réservée à l''agent et jamais publiée). ⚠️ Tout ce que porte cette colonne est PUBLIC : elle est servie telle quelle au portail. Le descriptif usager n''est pas ici, c''est la colonne user_description. Contrat possédé, consommé en aval.';

-- ---------------------------------------------------------------------------
-- 2. La colonne qui existait déjà change de statut
-- ---------------------------------------------------------------------------
-- `user_description` n'était saisie par AUCUN écran : elle est nulle sur les 51
-- démarches de la plateforme (vérifié le 2026-09-18). Elle devient le
-- « Descriptif de la démarche » de la nouvelle étape, rédigé en **Markdown**.
-- ⚠️ Déclarer le format maintenant ne réinterprète aucune valeur existante — il
-- n'y en a pas. Le faire plus tard, une fois des textes saisis, aurait changé le
-- sens de données déjà publiées.
comment on column public.procedures.user_description is
  'Descriptif de la démarche destiné à l''usager, en **Markdown** depuis le 2026-09-18, saisi à l''étape « Communication usager ». ⚠️ Distinct de short_description (résumé d''une ligne, étape « Descriptif », texte brut, traduit) et d''agent_description (interne, publié sur Procedure mais JAMAIS au portail). Servi sur Procedure, PortalProcedure et PortalProcedureDetail.';
