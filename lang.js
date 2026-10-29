// Multi-language Management System
// Usage: setLanguage('fr') or setLanguage('en')

const translations = {
    fr: {
        nav_home: "Accueil",
        nav_about: "À Propos",
        nav_expertise: "Expertise",
        nav_filiales: "Filiales",
        nav_investors: "Investisseurs",
        nav_careers: "Carrières",
        nav_calls: "Appels à Projets",
        nav_contact: "Contact",
        
        hero_title: "Transformer l'Afrique par<br><span class='text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-500'>l'Investissement d'Impact</span>",
        hero_subtitle: "PK GLOBAL PARTNERS est une holding stratégique dédiée à l'éclosion de champions nationaux et au développement de projets multisectoriels en République Démocratique du Congo.",
        hero_invest: "Investir avec nous",
        hero_realisations: "Nos Réalisations",
        
        stats_filiales: "Filiales Actives",
        stats_collaborateurs: "Collaborateurs",
        stats_capital: "Capital Congolais",
        stats_secteurs: "Secteurs d'Impact",
        
        section_groupe_title: "Une holding structurée pour la performance durable",
        section_groupe_description: "PK GLOBAL PARTNERS opère comme un moteur de croissance en RDC. Nous combinons expertise financière et rigueur opérationnelle pour développer des solutions dans l'énergie, la mobilité et le digital.",
        
        value_excellence: "Excellence & Rigueur",
        value_excellence_desc: "Gouvernance transparente et standards de performance internationaux.",
        value_impact: "Impact & Durabilité",
        value_impact_desc: "Investissements responsables alignés sur les principes ESG.",
        
        poles_title: "Nos Pôles d'Expertise",
        poles_subtitle: "Nous intervenons sur toute la chaîne de valeur, de la structuration financière à l'exploitation opérationnelle.",
    },
    en: {
        nav_home: "Home",
        nav_about: "About",
        nav_expertise: "Expertise",
        nav_filiales: "Subsidiaries",
        nav_investors: "Investors",
        nav_careers: "Careers",
        nav_calls: "Calls for Projects",
        nav_contact: "Contact",
        
        hero_title: "Transform Africa Through<br><span class='text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-500'>Impact Investment</span>",
        hero_subtitle: "PK GLOBAL PARTNERS is a strategic holding dedicated to nurturing national champions and developing multi-sector projects in the Democratic Republic of Congo.",
        hero_invest: "Invest with us",
        hero_realisations: "Our Achievements",
        
        stats_filiales: "Active Subsidiaries",
        stats_collaborateurs: "Collaborators",
        stats_capital: "Congolese Capital",
        stats_secteurs: "Impact Sectors",
        
        section_groupe_title: "A structured holding for sustainable performance",
        section_groupe_description: "PK GLOBAL PARTNERS operates as a growth engine in DRC. We combine financial expertise and operational rigor to develop solutions in energy, mobility and digital.",
        
        value_excellence: "Excellence & Rigor",
        value_excellence_desc: "Transparent governance and international performance standards.",
        value_impact: "Impact & Sustainability",
        value_impact_desc: "Responsible investments aligned with ESG principles.",
        
        poles_title: "Our Areas of Expertise",
        poles_subtitle: "We intervene along the entire value chain, from financial structuring to operational exploitation.",
    }
};

function setLanguage(lang) {
    // Validate language
    if (!translations[lang]) {
        console.error('Language not supported:', lang);
        return;
    }

    // Save preference to localStorage
    localStorage.setItem('pkgp-language', lang);

    // Update active language button
    document.querySelectorAll('[data-language]').forEach(btn => {
        btn.classList.remove('bg-yellow-400', 'text-emerald-900');
        btn.classList.add('text-white');
    });
    document.querySelector(`[data-language="${lang}"]`)?.classList.add('bg-yellow-400', 'text-emerald-900');

    // Update HTML lang attribute
    document.documentElement.lang = lang;

    // Update all translatable elements
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const translation = translations[lang][key];
        
        if (translation) {
            // Check if it contains HTML (like <br> tags)
            if (key.includes('title') && translation.includes('<')) {
                element.innerHTML = translation;
            } else {
                element.textContent = translation;
            }
        }
    });

    // Trigger language change event
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
}

// Initialize language on page load
document.addEventListener('DOMContentLoaded', function() {
    const savedLanguage = localStorage.getItem('pkgp-language') || 'fr';
    setLanguage(savedLanguage);
});

// Export for use in other scripts
window.setLanguage = setLanguage;
window.translations = translations;
