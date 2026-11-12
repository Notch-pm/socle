-- Catalogue des courriels système de départ — voir 20261112083009_modeles_courriels.sql.
-- 4. Courriels système de départ : ceux qu'Iris envoie aujourd'hui aux usagers
--    (textes repris de Iris/supabase/functions/_shared/email/{accuse,avisUsager,
--    cloture,codeAcces}.ts). La « réponse à l'usager », rédigée librement par
--    l'agent, n'est pas un modèle.
insert into public.email_template_defaults
  (key, position, name, description, application_ids, variables, subject, body)
values
(
  'accuse_reception', 10,
  'Accusé de réception de la demande',
  'Envoyé à l''usager au dépôt de sa demande. Le code d''accès n''apparaît que si le suivi en ligne a été accepté.',
  array['iris'],
  array['usager.salutation','demande.objet','demande.reference','demande.date_depot','demande.organisme_responsable','demande.lien','demande.code_acces','organisme.nom'],
  'Nous avons bien reçu votre demande',
  $t${{usager.salutation}},

Nous avons bien reçu votre demande {{#demande.objet}}« {{demande.objet}} » {{/demande.objet}}(référence {{demande.reference}}){{#demande.date_depot}}, déposée le {{demande.date_depot}}{{/demande.date_depot}}.
{{#demande.organisme_responsable}}
Elle sera traitée par : {{demande.organisme_responsable}}.
{{/demande.organisme_responsable}}
Conservez cette référence : elle vous sera demandée pour toute question au sujet de votre demande.
{{#demande.code_acces}}
Pour suivre votre demande en ligne, rendez-vous sur {{demande.lien}}
avec votre adresse de courriel, cette référence et votre code d'accès : {{demande.code_acces}}
Ce code est personnel : ne le communiquez à personne.
{{/demande.code_acces}}
Cordialement,
{{organisme.nom}}$t$
),
(
  'debut_instruction', 20,
  'Courriel de début d''instruction',
  'Envoyé quand un agent prend la demande en charge.',
  array['iris'],
  array['demande.libelle_demarche','demande.reference','demande.statut_usager','demande.lien','organisme.nom'],
  'Votre demande {{demande.reference}} est en cours de traitement',
  $t$Bonjour,

Votre demande {{#demande.libelle_demarche}}« {{demande.libelle_demarche}} » {{/demande.libelle_demarche}}(référence {{demande.reference}}) est désormais prise en charge par nos services.

Statut : {{demande.statut_usager}}.

Cordialement,
{{organisme.nom}}$t$
),
(
  'attente_information', 30,
  'Demande en attente d''un complément',
  'Envoyé quand la demande passe en attente d''une réponse de l''usager.',
  array['iris'],
  array['demande.libelle_demarche','demande.reference','demande.statut_usager','demande.lien','organisme.nom'],
  'Votre demande {{demande.reference}} attend votre réponse',
  $t$Bonjour,

Nos services ont besoin d'un complément pour poursuivre le traitement de votre demande {{#demande.libelle_demarche}}« {{demande.libelle_demarche}} » {{/demande.libelle_demarche}}(référence {{demande.reference}}). Consultez-la en ligne pour savoir ce qui vous est demandé.

Statut : {{demande.statut_usager}}.

Cordialement,
{{organisme.nom}}$t$
),
(
  'reprise_instruction', 40,
  'Reprise de l''instruction',
  'Envoyé quand une demande en attente repasse en cours de traitement.',
  array['iris'],
  array['demande.libelle_demarche','demande.reference','demande.statut_usager','demande.lien','organisme.nom'],
  'Votre demande {{demande.reference}} est de nouveau en cours de traitement',
  $t$Bonjour,

Votre demande {{#demande.libelle_demarche}}« {{demande.libelle_demarche}} » {{/demande.libelle_demarche}}(référence {{demande.reference}}) est de nouveau en cours de traitement.

Statut : {{demande.statut_usager}}.

Cordialement,
{{organisme.nom}}$t$
),
(
  'annulation', 50,
  'Demande annulée',
  'Envoyé quand la demande est annulée.',
  array['iris'],
  array['demande.libelle_demarche','demande.reference','demande.statut_usager','demande.lien','organisme.nom'],
  'Votre demande {{demande.reference}} a été annulée',
  $t$Bonjour,

Votre demande {{#demande.libelle_demarche}}« {{demande.libelle_demarche}} » {{/demande.libelle_demarche}}(référence {{demande.reference}}) a été annulée.

Statut : {{demande.statut_usager}}.

Cordialement,
{{organisme.nom}}$t$
),
(
  'reouverture', 60,
  'Demande rouverte',
  'Envoyé quand une demande close est rouverte.',
  array['iris'],
  array['demande.libelle_demarche','demande.reference','demande.statut_usager','demande.lien','organisme.nom'],
  'Votre demande {{demande.reference}} a été rouverte',
  $t$Bonjour,

Votre demande {{#demande.libelle_demarche}}« {{demande.libelle_demarche}} » {{/demande.libelle_demarche}}(référence {{demande.reference}}) a été rouverte : elle est de nouveau en cours de traitement.

Statut : {{demande.statut_usager}}.

Cordialement,
{{organisme.nom}}$t$
),
(
  'cloture_positive', 70,
  'Avis de clôture — réponse positive',
  'Envoyé à la résolution positive de la demande. Le commentaire de clôture de l''agent n''apparaît que s''il a été saisi.',
  array['iris'],
  array['usager.salutation','demande.objet','demande.reference','demande.commentaire_cloture','organisme.nom'],
  'Votre demande a été résolue positivement',
  $t${{usager.salutation}},

Votre demande {{#demande.objet}}« {{demande.objet}} » {{/demande.objet}}(référence {{demande.reference}}) a reçu une suite favorable.
{{#demande.commentaire_cloture}}
{{demande.commentaire_cloture}}
{{/demande.commentaire_cloture}}
Cordialement,
{{organisme.nom}}$t$
),
(
  'cloture_negative', 80,
  'Avis de clôture — réponse négative',
  'Envoyé à la résolution négative de la demande. Le commentaire de clôture de l''agent n''apparaît que s''il a été saisi.',
  array['iris'],
  array['usager.salutation','demande.objet','demande.reference','demande.commentaire_cloture','organisme.nom'],
  'Nous ne pouvons répondre positivement à votre demande',
  $t${{usager.salutation}},

Votre demande {{#demande.objet}}« {{demande.objet}} » {{/demande.objet}}(référence {{demande.reference}}) n'a pas pu recevoir une suite favorable.
{{#demande.commentaire_cloture}}
{{demande.commentaire_cloture}}
{{/demande.commentaire_cloture}}
Cordialement,
{{organisme.nom}}$t$
),
(
  'nouveau_message', 90,
  'Nouveau message de l''agent',
  'Envoyé quand un agent publie un message à l''usager. Il n''en cite qu''un extrait et renvoie à la demande en ligne.',
  array['iris'],
  array['demande.libelle_demarche','demande.reference','message.extrait','message.nombre','demande.lien','organisme.nom'],
  'Nouveau message concernant votre demande {{demande.reference}}',
  $t$Bonjour,

Vous avez reçu un nouveau message concernant votre demande {{#demande.libelle_demarche}}« {{demande.libelle_demarche}} » {{/demande.libelle_demarche}}(référence {{demande.reference}}) :

« {{message.extrait}} »

Cordialement,
{{organisme.nom}}$t$
),
(
  'code_acces', 100,
  'Nouveau code d''accès',
  'Envoyé quand l''usager a perdu son code d''accès, ou qu''un agent en crée un nouveau.',
  array['iris'],
  array['demande.objet','demande.reference','demande.code_acces','demande.lien','organisme.nom'],
  'Votre nouveau code d''accès',
  $t$Bonjour,

Un nouveau code d'accès a été créé pour suivre en ligne votre demande {{#demande.objet}}« {{demande.objet}} » {{/demande.objet}}(référence {{demande.reference}}).

Votre code d'accès : {{demande.code_acces}}
Il remplace le précédent, qui ne fonctionne plus.

Pour suivre votre demande, rendez-vous sur {{demande.lien}}
avec votre adresse de courriel, la référence et ce code. Ce code est personnel : ne le communiquez à personne.

Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : seul ce code permet d'accéder à votre demande.

Cordialement,
{{organisme.nom}}$t$
);
