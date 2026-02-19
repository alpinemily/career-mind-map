// Mock data used in dev mode (?dev in the URL).
// No API calls are made when this data is in use.

export const MOCK_ASSOCIATIONS = {
  engagement: {
    keyword: 'engagement',
    associations: [
      { word: 'strategy',   secondary: ['planning',  'vision',    'goals']    },
      { word: 'data',       secondary: ['metrics',   'analytics', 'insights'] },
      { word: 'people',     secondary: ['teams',     'culture',   'trust']    },
      { word: 'systems',    secondary: ['process',   'workflow',  'tools']    },
      { word: 'growth',     secondary: ['scale',     'learning',  'change']   },
      { word: 'feedback',   secondary: ['iterate',   'improve',   'listen']   },
      { word: 'impact',     secondary: ['value',     'outcomes',  'results']  }
    ]
  },
  energy: {
    keyword: 'energy',
    associations: [
      { word: 'creativity', secondary: ['art',       'design',    'ideas']    },
      { word: 'movement',   secondary: ['rhythm',    'flow',      'body']     },
      { word: 'community',  secondary: ['connect',   'belong',    'share']    },
      { word: 'nature',     secondary: ['outdoors',  'explore',   'wild']     },
      { word: 'teaching',   secondary: ['mentor',    'inspire',   'guide']    },
      { word: 'building',   secondary: ['craft',     'make',      'construct']},
      { word: 'stories',    secondary: ['narrative', 'voice',     'publish']  }
    ]
  },
  flow: {
    keyword: 'flow',
    associations: [
      { word: 'music',      secondary: ['compose',   'perform',   'listen']   },
      { word: 'writing',    secondary: ['words',     'draft',     'edit']     },
      { word: 'code',       secondary: ['logic',     'debug',     'ship']     },
      { word: 'sports',     secondary: ['compete',   'train',     'team']     },
      { word: 'cooking',    secondary: ['flavor',    'recipe',    'nourish']  },
      { word: 'speaking',   secondary: ['audience',  'persuade',  'clarity']  },
      { word: 'research',   secondary: ['discover',  'question',  'analyze']  }
    ]
  }
}

const MOCK_CAREERS = {
  serious: [
    { title: 'Community Learning Director',       description: 'Lead educational programs that connect underserved communities with practical skills and career pathways.' },
    { title: 'Behavioral Data Strategist',        description: 'Use behavioral research to help organizations design better systems, policies, and employee experiences.' },
    { title: 'Organizational Health Consultant',  description: 'Advise companies on building cultures where people perform at their best without burning out.' },
    { title: 'Cultural Heritage Archivist',       description: 'Document and preserve living traditions for institutions, governments, and community organizations.' },
    { title: 'Systems Impact Analyst',            description: 'Map complex social or operational systems to identify where targeted interventions create the most change.' },
    { title: 'Narrative Strategy Consultant',     description: 'Help nonprofits and mission-driven brands shape the stories that drive fundraising and public trust.' },
    { title: 'Experiential Curriculum Designer',  description: 'Build hands-on learning programs for schools, companies, or training institutes that actually stick.' },
    { title: 'Innovation Program Manager',        description: 'Run structured ideation and piloting cycles inside large organizations to move new ideas from concept to launch.' },
  ],
  playful: [
    { title: 'Tiny Museum Curator',               description: 'Open a shoebox-sized museum dedicated to one absurdly specific topic — like the history of lost mittens.' },
    { title: 'Professional Daydream Coach',       description: 'Help overworked adults rediscover imagination through guided daydreaming sessions and whimsy workshops.' },
    { title: 'Chaos Choreographer',               description: 'Design gloriously unpredictable public experiences — think flash mobs, but weirder and with snacks.' },
    { title: 'Underwater Storyteller',            description: 'Narrate audiobook chapters while scuba diving, because why should fish get boring background noise?' },
    { title: 'Competitive Napping Judge',         description: 'Officiate at the emerging sport of synchronized napping, scoring technique, commitment, and drool artistry.' },
    { title: 'Cloud Shapes Correspondent',        description: 'File daily cloud shape reports for people too busy to look up — distributed as a very slow newsletter.' },
    { title: 'Villain Origin Story Therapist',    description: 'Offer therapy exclusively to fictional villains, helping them process the moment everything went sideways.' },
    { title: 'Lost Sock Detective Agency',        description: 'Investigate the disappearance of socks worldwide using forensic laundry science and dramatic monologues.' },
  ]
}

export function getMockCareerIdeas(groups, tone = 'serious') {
  const pool = MOCK_CAREERS[tone] ?? MOCK_CAREERS.serious
  return groups.map((_, i) => ({
    groupIndex: i,
    title: pool[i % pool.length].title,
    description: pool[i % pool.length].description
  }))
}
