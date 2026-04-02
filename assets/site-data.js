window.EuclidSiteData = {
  euclidQuasars: window.EuclidPublishedSample || [],
  comparisonSample: window.EuclidComparisonSample || [],
  skyMapOverlays: window.EuclidSkyMapOverlays || null,
  papers: [
    {
      id: "paper-barnett-2019",
      title: "Euclid preparation. V. Predicted yield of redshift 7 < z < 9 quasars from the wide survey",
      year: 2019,
      publishedDate: "2019-10-21",
      authors: "R. Barnett, S. J. Warren, D. J. Mortlock et al.",
      venue: "A&A",
      description:
        "Forecasts the number of quasars that the Euclid wide survey should uncover at 7 < z < 9, emphasizing the value of complementary z-band imaging for selection.",
      tags: ["sample", "selection"],
      adsUrl: "https://ui.adsabs.harvard.edu/abs/2019A%26A...631A..85E/abstract",
      relatedQuasarIds: []
    },
    {
      id: "paper-yang-2026",
      title: "Euclid: Discovery of 31 new quasars at 6.6 < z < 7.8",
      year: 2026,
      publishedDate: "2026-03-30",
      authors: "D. Yang, J. Hennawi, F. Guarneri et al.",
      venue: "A&A",
      description:
        "First results from the Euclid wide survey, presenting 31 new quasars at 6.6 < z < 7.8.",
      tags: ["sample", "selection"],
      relatedQuasarIds: [
        "J0300-6638",
        "J1736+6120",
        "J1817+6057",
        "J0456-5505",
        "J0925+6722",
        "J0447-3141",
        "J1139+7219",
        "J0450-5541",
        "J1531+5606",
        "J1521+7652",
        "J1429+6623",
        "J0257-3846",
        "J1557+4436",
        "J1701+6642",
        "J0238-5031",
        "J0534-4446",
        "J1548+5350",
        "J0926+7711",
        "J1620+4329",
        "J1712+5840",
        "J1348+6645",
        "J0417-5801",
        "J1623+6215",
        "J1428+7216",
        "J1452+7023",
        "J1403+7151",
        "J0535-4930",
        "J1026+6505",
        "J1242+6843",
        "J1715+6233"
      ]
    },
    {
      id: "paper-belladitta-2026",
      title: "Euclid: A UV-faint quasar in a highly luminous star-forming host galaxy at z ≈ 7.7",
      year: 2026,
      publishedDate: "2026-04-10",
      authors: "S. Belladitta, R. Decarli, E. Banados et al.",
      venue: "A&A",
      description:
        "NOEMA follow-up observations of a UV-faint quasar in a highly luminous star-forming host galaxy at z ≈ 7.7.",
      tags: ["host galaxy", "submm"],
      relatedQuasarIds: ["J1242+6843"]
    }
  ],
  team: [
    {
      name: "Daming Yang",
      role: "Graduate student",
      affiliation: "Leiden Observatory, Graduate student",
      focus: "High-redshift quasar selection and follow-up.",
      image: "assets/team/daming-yang.jpg"
    },
    {
      name: "Joseph Hennawi",
      role: "Faculty",
      affiliation: "Leiden Observatory / University of California, Santa Barbara, Faculty",
      focus: "Quasar science and survey strategy.",
      image: null
    },
    {
      name: "Jan-Torge Schindler",
      role: "Faculty, co-lead",
      affiliation: "Hamburg Observatory, Faculty, co-lead",
      sortPriority: 0,
      focus: "Quasar selection and survey analysis.",
      image: null
    },
    {
      name: "Francesco Guarneri",
      role: "Postdoc",
      affiliation: "Hamburg Observatory, Postdoc",
      focus: "Catalog work and imaging analysis.",
      image: null
    },
    {
      name: "Eduardo Banados",
      role: "Faculty",
      affiliation: "Max-Planck-Institut für Astronomie, Faculty",
      focus: "High-redshift quasars and follow-up observations.",
      image: null
    },
    {
      name: "Daniel Mortlock",
      role: "Faculty, co-lead",
      affiliation: "Imperial College London, Faculty, co-lead",
      sortPriority: 1,
      focus: "Quasar demographics and survey interpretation.",
      image: null
    },
    {
      name: "Feige Wang",
      role: "Faculty",
      affiliation: "University of Michigan, Faculty",
      focus: "High-redshift quasars and early-universe observations.",
      image: null
    },
    {
      name: "Jinyi Yang",
      role: "Faculty",
      affiliation: "University of Michigan, Faculty",
      focus: "Quasar discovery and follow-up analysis.",
      image: null
    },
    {
      name: "Xiaohui Fan",
      role: "Faculty",
      affiliation: "University of Arizona, Faculty",
      focus: "Quasar surveys and high-redshift quasar populations.",
      image: null
    },
    {
      name: "Silvia Belladitta",
      role: "Postdoc",
      affiliation: "Max-Planck-Institut für Astronomie, Postdoc",
      focus: "Imaging analysis and quasar candidate validation.",
      image: null
    },
    {
      name: "Julien Wolf",
      role: "Postdoc",
      affiliation: "Max-Planck-Institut für Astronomie, Postdoc",
      focus: "Survey analysis and data validation.",
      image: null
    },
    {
      name: "Anna-Christina Eilers",
      role: "Faculty",
      affiliation: "Massachusetts Institute of Technology, Faculty",
      focus: "High-redshift quasars and spectroscopy.",
      image: null
    },
    {
      name: "Daniel Stern",
      role: "Faculty",
      affiliation: "JPL, Faculty",
      focus: "Infrared surveys and quasar follow-up.",
      image: null
    },
    {
      name: "Yoshiki Matsuoka",
      role: "Faculty",
      affiliation: "Ehime University, Faculty",
      focus: "Quasar surveys and public science catalogs.",
      image: null
    },
    {
      name: "Masafusa Onoue",
      role: "Faculty",
      affiliation: "Waseda University, Faculty",
      focus: "High-redshift quasars and survey interpretation.",
      image: null
    },
    {
      name: "Arvind Hughes",
      role: "Postdoc",
      affiliation: "Imperial College London, Postdoc",
      focus: "Quasar survey analysis and follow-up.",
      image: null
    },
    {
      name: "Ben Wang",
      role: "Graduate student",
      affiliation: "Leiden Observatory / Tsinghua University, Graduate student",
      focus: "High-redshift quasar selection and catalog work.",
      image: null
    },
    {
      name: "Chris Willott",
      role: "Faculty",
      affiliation: "Herzberg, Faculty",
      focus: "Quasar surveys and early-universe observations.",
      image: null
    },
    {
      name: "Frederick Davies",
      role: "Faculty",
      affiliation: "Max-Planck-Institut für Astronomie, Faculty",
      focus: "High-redshift quasars and spectroscopy.",
      image: null
    },
    {
      name: "Giustina Vietri",
      role: "Postdoc",
      affiliation: "INAF, Postdoc",
      focus: "Imaging analysis and quasar candidate validation.",
      image: null
    },
    {
      name: "Huub Rottgering",
      role: "Faculty",
      affiliation: "Leiden Observatory, Faculty",
      focus: "Survey science and team coordination.",
      image: null
    },
    {
      name: "Ji-Jia Tang",
      role: "Postdoc",
      affiliation: "Ehime University, Postdoc",
      focus: "Quasar follow-up and public science catalogs.",
      image: null
    },
    {
      name: "Knud Janke",
      role: "Faculty",
      affiliation: "Max-Planck-Institut für Astronomie, Faculty",
      focus: "Survey strategy and quasar science.",
      image: null
    },
    {
      name: "Roberto Decarli",
      role: "Faculty",
      affiliation: "INAF, Faculty",
      focus: "Quasar follow-up observations and interpretation.",
      image: null
    },
    {
      name: "Sarah Bosman",
      role: "Faculty",
      affiliation: "Max-Planck-Institut für Astronomie, Faculty",
      focus: "High-redshift quasars and reionization studies.",
      image: null
    },
    {
      name: "Yuming Fu",
      role: "Postdoc",
      affiliation: "Leiden Observatory, Postdoc",
      focus: null,
      image: null
    },
    {
      name: "Aaron Barth",
      role: "Faculty",
      affiliation: "University of California, Irvine, Faculty",
      focus: null,
      image: null
    }
  ]
};
