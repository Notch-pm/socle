-- ============================================================================
-- SNA27 — bloc « Lieu d'intervention » sur les 8 démarches de signalement.
--
-- Motif : ces démarches décrivaient le lieu par un champ LIBRE (« Adresse ou
-- localisation »). Iris ne sait poser une épingle sur la carte des
-- interventions que depuis les clés `intervention_*` du bloc standard du Socle
-- (ou, à défaut, une section titrée « Lieu d'intervention ») : un texte libre
-- n'est pas une adresse, il n'est pas géocodable.
--
-- Le champ libre est REMPLACÉ, pas doublé : demander deux fois l'adresse à
-- l'usager dans le même formulaire ne vaut rien. Là où aucun champ de
-- localisation n'existait (collecte, transport, équipement municipal), le bloc
-- est simplement inséré.
--
-- Bloc standard du Socle, moins « Appartement » (sans objet sur l'espace
-- public) : Numéro · BTQ · Voie* · Complément · Code postal* · Ville*.
--
-- Rejouable : une démarche portant déjà `intervention_voie` est ignorée.
-- Les demandes DÉJÀ déposées ne bougent pas — leur `procedure_snapshot` est figé.
-- ============================================================================
do $body$
declare
  v_template constant text := $json$
    {
      "id": "@@-lieu",
      "kind": "section",
      "title": "Lieu d'intervention",
      "description": "Où se situe le problème constaté ?",
      "fields": [
        { "id": "@@-int-numero", "key": "intervention_numero", "type": "text", "label": "Numéro" },
        { "id": "@@-int-btq", "key": "intervention_btq", "help": "Bis, ter, quater", "type": "select", "label": "BTQ",
          "options": [ { "label": "Bis", "value": "bis" }, { "label": "Ter", "value": "ter" }, { "label": "Quater", "value": "quater" } ] },
        { "id": "@@-int-voie", "key": "intervention_voie", "type": "text", "label": "Voie", "required": true },
        { "id": "@@-int-complement", "key": "intervention_complement", "help": "Lieu-dit, point de repère, côté de la voie…", "type": "text", "label": "Complément d'adresse" },
        { "id": "@@-int-cp", "key": "intervention_code_postal", "type": "text", "label": "Code postal", "required": true, "maxLength": 5 },
        { "id": "@@-int-ville", "key": "intervention_ville", "type": "text", "label": "Ville", "required": true }
      ]
    }
  $json$;
  r         record;
  v_content jsonb;
  v_new     jsonb;
  v_section jsonb;
  i         int;
  v_touched int;
begin
  for r in
    select * from (values
      ('e937a4a9-ea4f-4995-9208-cfeefb11de3e'::uuid, 'ep',        'replace', 'ep-loc'),
      ('28f7c83e-24f7-4108-9af1-12f3abaddced'::uuid, 'ds',        'replace', 'ds-loc'),
      ('fec4a05f-81ab-4018-a452-13e056463c14'::uuid, 'ev',        'replace', 'ev-loc'),
      ('c4e0e52d-cb19-4054-89e7-8a95a2dfb083'::uuid, 'fuite',     'replace', 'fuite-localisation'),
      ('18db8d6d-1da5-4d7f-9c2d-00ff941799f9'::uuid, 'velo',      'replace', 'velo-localisation'),
      ('984a5c28-5779-4c65-9b44-4d30f9113de2'::uuid, 'collecte',  'before',  'collecte-type'),
      ('65e79f47-5caa-4e9d-9477-8372fff8c19a'::uuid, 'transport', 'after',   'transport-arret'),
      ('1db3f406-7776-47fc-b2d8-a29888c2693e'::uuid, 'eq',        'after',   'eq-equipement')
    ) as t(proc_id, pfx, mode, anchor)
  loop
    select p.form_schema -> 'content' into v_content from public.procedures p where p.id = r.proc_id;
    if v_content is null or jsonb_typeof(v_content) <> 'array' then
      raise exception 'Démarche % : form_schema.content absent ou mal formé.', r.proc_id;
    end if;
    continue when v_content::text like '%intervention_voie%';

    v_section := replace(v_template, '@@', r.pfx)::jsonb;
    v_new     := '[]'::jsonb;
    v_touched := 0;

    for i in 0 .. jsonb_array_length(v_content) - 1 loop
      if v_content -> i ->> 'id' = r.anchor then
        v_touched := v_touched + 1;
        if r.mode = 'replace' then
          v_new := v_new || jsonb_build_array(v_section);
        elsif r.mode = 'before' then
          v_new := v_new || jsonb_build_array(v_section, v_content -> i);
        else
          v_new := v_new || jsonb_build_array(v_content -> i, v_section);
        end if;
      else
        v_new := v_new || jsonb_build_array(v_content -> i);
      end if;
    end loop;

    if v_touched <> 1 then
      raise exception 'Démarche % : ancre « % » trouvée % fois (1 attendue).', r.proc_id, r.anchor, v_touched;
    end if;

    update public.procedures
       set form_schema = jsonb_set(form_schema, '{content}', v_new)
     where id = r.proc_id;
  end loop;
end
$body$;
