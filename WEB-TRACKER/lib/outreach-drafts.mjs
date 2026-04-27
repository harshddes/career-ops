const TEMPLATES = {
  academic: {
    subject: '{topic} — quick research-fit question',
    body: `Hi {name},

I am exploring {topic} from a plasma instrumentation / diagnostics background, and your work at {organization} stood out because it connects directly to {specific_hook}.

My closest overlap is {proof_point}. I am trying to understand whether this background could fit your group/program, especially around {target_problem}.

Would you be open to a brief 15-20 minute conversation, or is there a better person I should contact?`,
  },
  industry: {
    subject: '{company} — {role} fit',
    body: `Hi {name},

I saw the {role} opening at {company}. The part that stood out is {specific_hook}.

My closest proof point is {proof_point}, which maps to the role through {target_problem}.

Would you be open to a quick conversation about how your team is approaching this?`,
  },
  hr: {
    subject: '{role} application — work authorization and fit',
    body: `Hi {name},

I am interested in the {role} role at {company}. My strongest fit is {proof_point}.

Before applying deeply, I wanted to confirm the work authorization path: {visa_question}

If this aligns with your screening criteria, I would be happy to share my CV and a tailored summary.`,
  },
};

function fill(template, data) {
  return template.replace(/\{([^}]+)\}/g, (_, key) => data[key] || `[${key}]`);
}

export function buildOutreachDraft(input = {}) {
  const category = TEMPLATES[input.category] ? input.category : 'industry';
  const data = {
    name: input.name || 'there',
    organization: input.organization || input.company || 'your organization',
    company: input.company || input.organization || 'the company',
    role: input.role || input.title || 'open role',
    topic: input.topic || input.role || input.title || 'fusion diagnostics',
    specific_hook: input.specific_hook || 'a technical area I have been tracking closely',
    proof_point: input.proof_point || 'my hands-on work with plasma diagnostics, detector readout, calibration, and systems testing',
    target_problem: input.target_problem || 'instrumentation, testing, and diagnostic reliability',
    visa_question: input.visa_question || 'whether the team can support H-1B sponsorship, green-card sponsorship, or other non-citizen work authorization paths',
  };
  const tpl = TEMPLATES[category];
  return {
    category,
    subject: fill(tpl.subject, data),
    body: fill(tpl.body, data),
    channel: input.channel || (category === 'academic' ? 'email' : 'email_or_linkedin'),
  };
}
