document.addEventListener('DOMContentLoaded', () => {
    let allData = { verbs: [], verbsByBase: new Map(), verbWordSet: new Set(), prefixes: [], suffixes: [] };
    let lastResults = [];
    let displayedResults = [];
    let allBaseWords = [];
    let isGenerating = false;
    let currentSettings = {};

    const dom = {
        status: document.getElementById('status'),
        downloadBtn: document.getElementById('downloadBtn'),
        resultsContainer: document.getElementById('resultsContainer'),
        wordIndex: document.getElementById('wordIndex'),
        wordFilter: document.getElementById('wordFilter'),
        themeToggle: document.getElementById('themeToggle'),
        loaderOverlay: document.querySelector('.loader-overlay'),
        toggleUnlistedBtn: document.getElementById('toggleUnlistedBtn'),
        unlistedWordPanel: document.getElementById('unlistedWordPanel'),
        autoFillBtn: document.getElementById('autoFillBtn'),
        generateUnlistedBtn: document.getElementById('generateUnlistedBtn'),
        otherFormsContainer: document.getElementById('other-forms-container'),
        resultSort: document.getElementById('resultSort'),
        constructionFilter: document.getElementById('constructionFilter'),
        posFilter: document.getElementById('posFilter'),
        alternateFilter: document.getElementById('alternateFilter'),
        layoutFlow: document.getElementById('layoutFlow'),
        settingsOverlay: document.getElementById('settings-overlay'),
        startAppBtn: document.getElementById('start-app-btn'),
        settingWordSort: document.getElementById('setting-word-sort'),
        settingResultSort: document.getElementById('setting-result-sort'),
        mainUI: document.querySelector('.main-ui')
    };

    const dataUrls = {
        verbs: ['build/verbFullList.csv', 'https://raw.githubusercontent.com/andylehti/morphologicon/main/build/verbFullList.csv'],
        prefixes: ['build/prefixes.csv', 'https://raw.githubusercontent.com/andylehti/morphologicon/main/build/prefixes.csv'],
        suffixes: ['build/completeSuffixes.csv', 'https://raw.githubusercontent.com/andylehti/morphologicon/main/build/completeSuffixes.csv']
    };

    const vowels = new Set('aeiou');
    const allomorphRules = {
        'a-': { vowel: 'an-' },
        'in-': { r: 'ir-', l: 'il-', b: 'im-', p: 'im-', m: 'im-' },
        'ad-': { c: 'ac-', q: 'ac-', f: 'af-', g: 'ag-', l: 'al-', n: 'an-', p: 'ap-', r: 'ar-', s: 'as-', t: 'at-' },
        'sub-': { c: 'suc-', f: 'suf-', p: 'sup-', r: 'sur-', s: 'sus-' },
        'ex-': { f: 'ef-' },
        'en-': { b: 'em-', p: 'em-' },
        'co-': { b: 'com-', p: 'com-', m: 'com-', r: 'cor-' }
    };

    const prefixDefinitions = {
        'a-': forms => `To be without ${forms.present_participle} or to refrain from it.`,
        'anti-': forms => `To act against, resist, or oppose ${forms.present_participle}.`,
        'auto-': forms => `To ${forms.base} by or upon oneself, or to do so automatically.`,
        'co-': forms => `To ${forms.base} together, jointly, or in collaboration with another.`,
        'de-': forms => `To reverse or undo ${forms.present_participle}, or to reduce or remove its effect.`,
        'dis-': forms => `To reverse, undo, separate from, or move away from ${forms.present_participle}.`,
        'en-': forms => `To put into, cover with, or bring into a state associated with ${forms.present_participle}.`,
        'ex-': forms => `To move out of, remove from, or away from a state associated with ${forms.present_participle}.`,
        'in-': forms => `To put into or bring into a state associated with ${forms.present_participle}; in a negative use, to not ${forms.base}.`,
        'non-': forms => `To not ${forms.base}, or to remain outside the act or state of ${forms.present_participle}.`,
        're-': forms => `To ${forms.base} again, back, or anew.`,
        'sub-': forms => `To ${forms.base} beneath, below, under, or to a lesser degree.`,
        'ad-': forms => `To ${forms.base} toward or in relation to something, sometimes with an intensive force.`
    };

    const posLabels = {
        verb: 'v', noun: 'n', adjective: 'adj', adverb: 'adv',
        'adjective/noun': 'adj/n', 'noun/adjective': 'n/adj',
        'adjective/verb': 'adj/v', 'verb/adjective': 'v/adj',
        'adjective/adverb': 'adj/adv', 'adverb/adjective': 'adv/adj',
        'compound noun': 'n'
    };

    const updateStatus = (message, isError = false) => {
        dom.status.textContent = message;
        dom.status.style.color = isError ? '#e74c3c' : 'var(--text-color)';
    };

    dom.startAppBtn.addEventListener('click', startup);
    window.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !dom.settingsOverlay.classList.contains('hidden')) startup();
    });

    function startup() {
        currentSettings = { wordSort: dom.settingWordSort.value, resultSort: dom.settingResultSort.value };
        dom.resultSort.value = currentSettings.resultSort;
        dom.settingsOverlay.classList.add('hidden');
        dom.mainUI.classList.remove('hidden');
        initialize();
    }

    async function fetchText(urls) {
        let lastError;
        for (const url of urls) {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
                return await response.text();
            } catch (error) { lastError = error; }
        }
        throw lastError || new Error('Unable to load data.');
    }

    async function fetchCsv(urls) {
        const text = await fetchText(urls);
        return await new Promise((resolve, reject) => {
            Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
                transformHeader: header => String(header || '').replace(/^\uFEFF/, '').trim(),
                complete: results => {
                    const fatal = results.errors?.find(error => error.type === 'Quotes' || error.type === 'Delimiter');
                    if (fatal) return reject(new Error(fatal.message));
                    resolve(results.data.map(row => {
                        const clean = {};
                        for (const [key, value] of Object.entries(row)) clean[String(key || '').trim()] = String(value || '').trim();
                        return clean;
                    }));
                },
                error: reject
            });
        });
    }

    async function initialize() {
        try {
            setLoading(true, 'Fetching data...');
            const [verbs, rawPrefixes, rawSuffixes] = await Promise.all([
                fetchCsv(dataUrls.verbs), fetchCsv(dataUrls.prefixes), fetchCsv(dataUrls.suffixes)
            ]);
            allData.verbs = verbs;
            allData.verbsByBase = new Map();
            allData.verbWordSet = new Set();
            for (const row of verbs) {
                if (!row.base) continue;
                Object.values(row).forEach(value => {
                    const word = String(value || '').trim().toLowerCase();
                    if (word) allData.verbWordSet.add(word);
                });
                allData.verbsByBase.set(row.base.toLowerCase(), {
                    base: row.base,
                    present_singular: row.present_singular || '',
                    present_participle: row.present || '',
                    past_simple: row.past || '',
                    past_participle: row.participle || '',
                    adjective: row.adjective || ''
                });
            }
            allData.prefixes = preparePrefixes(rawPrefixes);
            allData.suffixes = prepareSuffixes(rawSuffixes);
            allBaseWords = [...new Set(verbs.map(row => row.base).filter(Boolean))];
            sortAndPopulateWordIndex();
            setupUnlistedPanel();
            updateStatus(`Data loaded: ${allData.prefixes.length} prefix families and ${allData.suffixes.length} suffixes.`);
        } catch (error) {
            updateStatus(`Initialization Error: ${error.message}`, true);
        } finally { setLoading(false); }
    }

    function setLoading(isLoading, message = '') {
        isGenerating = isLoading;
        dom.loaderOverlay.classList.toggle('hidden', !isLoading);
        dom.wordIndex.classList.toggle('loading', isLoading);
        if (message) updateStatus(message);
    }

    dom.wordFilter.addEventListener('input', sortAndPopulateWordIndex);
    dom.wordIndex.addEventListener('click', e => {
        const target = e.target.closest('li');
        if (!target || isGenerating) return;
        const currentActive = dom.wordIndex.querySelector('.active');
        if (currentActive) currentActive.classList.remove('active');
        target.classList.add('active');
        dom.unlistedWordPanel.classList.remove('active');
        generateAndDisplay({ base: target.dataset.word });
    });
    dom.resultSort.addEventListener('change', () => displayPrintLayout(lastResults));
    dom.constructionFilter.addEventListener('change', () => displayPrintLayout(lastResults));
    dom.posFilter.addEventListener('change', () => displayPrintLayout(lastResults));
    dom.alternateFilter.addEventListener('change', () => displayPrintLayout(lastResults));
    dom.layoutFlow.addEventListener('change', () => displayPrintLayout(lastResults));

    function sortAndPopulateWordIndex() {
        const filterText = dom.wordFilter.value.toLowerCase();
        let words = [...allBaseWords];
        if (currentSettings.wordSort === 'random') words.sort(() => Math.random() - 0.5);
        else if (currentSettings.wordSort === 'alpha') words.sort((a, b) => a.localeCompare(b));
        else if (currentSettings.wordSort === 'len-desc') words.sort((a, b) => b.length - a.length);
        dom.wordIndex.innerHTML = words
            .filter(word => word.toLowerCase().startsWith(filterText))
            .map(word => `<li data-word="${escapeHtml(word)}">${escapeHtml(word)}</li>`)
            .join('');
    }

    function setupUnlistedPanel() {
        const formFields = [
            { key: 'present_singular', label: '3rd person singular present', placeholder: 'e.g., eats' },
            { key: 'past_simple', label: 'Past simple', placeholder: 'e.g., ate' },
            { key: 'past_participle', label: 'Past participle', placeholder: 'e.g., eaten' },
            { key: 'present_participle', label: 'Present participle / gerund', placeholder: 'e.g., eating' },
            { key: 'adjective', label: 'Derivative adjective', placeholder: 'e.g., eatable' }
        ];
        dom.otherFormsContainer.innerHTML = formFields.map(field => `
            <div class="form-group">
                <label for="${field.key}-form">${field.label}</label>
                <input type="text" id="${field.key}-form" data-key="${field.key}" placeholder="${field.placeholder}">
            </div>`).join('');
        dom.toggleUnlistedBtn.addEventListener('click', () => dom.unlistedWordPanel.classList.toggle('active'));
        dom.autoFillBtn.addEventListener('click', () => {
            const base = document.getElementById('base-form').value.trim();
            if (!base) return alert('Please enter a base word first.');
            const forms = naiveInflect(base);
            for (const key of Object.keys(forms)) {
                const input = document.getElementById(`${key}-form`);
                if (input) input.value = forms[key] || '';
            }
        });
        dom.generateUnlistedBtn.addEventListener('click', () => {
            const base = document.getElementById('base-form').value.trim();
            if (!base) return alert('A base word is required.');
            const forms = { base };
            dom.otherFormsContainer.querySelectorAll('input').forEach(input => {
                const value = input.value.trim();
                if (value) forms[input.dataset.key] = value;
            });
            const currentActive = dom.wordIndex.querySelector('.active');
            if (currentActive) currentActive.classList.remove('active');
            generateAndDisplay(forms);
        });
    }

    function normalizePrefix(prefix) {
        const value = String(prefix || '').trim().toLowerCase();
        if (!value) return '';
        return value.endsWith('-') ? value : `${value}-`;
    }

    function preparePrefixes(rows) {
        const families = new Map();
        for (const row of rows) {
            if (!row.prefix || row.alias_of) continue;
            const prefix = normalizePrefix(row.prefix);
            if (!prefix || families.has(prefix)) continue;
            families.set(prefix, { ...row, prefix });
        }
        return [...families.values()];
    }

    function parseVowels(value) {
        return [...new Set(String(value || '')
            .toLowerCase().replace(/\n/g, ' ').split(/[,\s|/.]+/)
            .map(token => token.trim())
            .filter(token => token && [...token].every(char => vowels.has(char))))];
    }

    function prepareSuffixes(rows) {
        return rows.filter(row => row.suffix).map(row => {
            const suffixPrefix = row.suffix_prefix || row['Unnamed: 3'] || row.prex || '';
            return {
                ...row,
                suffix: String(row.suffix || '').trim().toLowerCase(),
                suffixPrefix,
                explicitLinkers: parseVowels(row.linkers),
                optionalLinkers: parseVowels(suffixPrefix)
            };
        });
    }

    function naiveInflect(base) {
        const consonantY = /[^aeiou]y$/i.test(base);
        const sibilant = /(s|x|z|ch|sh)$/i.test(base);
        const presentSingular = consonantY ? `${base.slice(0, -1)}ies` : sibilant ? `${base}es` : `${base}s`;
        const past = consonantY ? `${base.slice(0, -1)}ied` : /e$/i.test(base) ? `${base}d` : `${base}ed`;
        let presentParticiple;
        if (/ie$/i.test(base)) presentParticiple = `${base.slice(0, -2)}ying`;
        else if (/e$/i.test(base) && !/(ee|ye|oe)$/i.test(base)) presentParticiple = `${base.slice(0, -1)}ing`;
        else presentParticiple = `${base}ing`;
        const adjective = /e$/i.test(base) ? `${base.slice(0, -1)}able` : `${base}able`;
        return { base, present_singular: presentSingular, past_simple: past, past_participle: past, present_participle: presentParticiple, adjective };
    }

    function normalizeForms(input) {
        const base = String(input.base || '').trim();
        const generated = naiveInflect(base);
        const known = allData.verbsByBase.get(base.toLowerCase()) || {};
        const forms = { ...generated, ...known };
        for (const [key, value] of Object.entries(input)) if (String(value || '').trim()) forms[key] = String(value).trim();
        for (const key of ['present_singular', 'present_participle', 'past_simple', 'past_participle', 'adjective']) if (!forms[key]) forms[key] = generated[key];
        return forms;
    }

    function prefixCore(prefix) { return normalizePrefix(prefix).slice(0, -1); }
    function applyPrefix(prefix, text) { return `${prefixCore(prefix)}${text || ''}`; }

    function makePrefixedForms(prefix, forms) {
        return {
            base: applyPrefix(prefix, forms.base),
            present_singular: applyPrefix(prefix, forms.present_singular),
            past_simple: applyPrefix(prefix, forms.past_simple),
            past_participle: applyPrefix(prefix, forms.past_participle),
            present_participle: applyPrefix(prefix, forms.present_participle),
            adjective: applyPrefix(prefix, forms.adjective)
        };
    }

    function prefixSurfaces(prefix, stem) {
        const canonical = normalizePrefix(prefix);
        const surfaces = [canonical];
        const first = String(stem || '')[0]?.toLowerCase() || '';
        const rules = allomorphRules[canonical];
        if (rules) {
            const alternate = rules[first] || (rules.vowel && vowels.has(first) ? rules.vowel : '');
            if (alternate && alternate !== canonical) surfaces.push(alternate);
        }
        return [...new Set(surfaces)];
    }

    function prefixSense(row) {
        const senses = [row.sense_1, row.sense_2, row.sense_3, row.sense_4].filter(Boolean);
        if (!senses.length) return '';
        if (senses.length === 1) return `the sense “${senses[0]}”`;
        if (senses.length === 2) return `the senses “${senses[0]}” or “${senses[1]}”`;
        return `the senses ${senses.slice(0, -1).map(value => `“${value}”`).join(', ')}, or “${senses.at(-1)}”`;
    }

    function senseList(values) {
        const senses = [...new Set(values.filter(Boolean).map(value => String(value).trim().replace(/\//g, ' or ')))];
        if (!senses.length) return '';
        if (senses.length === 1) return senses[0];
        if (senses.length === 2) return `${senses[0]} or ${senses[1]}`;
        return `${senses.slice(0, -1).join(', ')}, or ${senses.at(-1)}`;
    }

    function prefixGloss(row) {
        return senseList([row.sense_1, row.sense_2, row.sense_3, row.sense_4]);
    }

    function suffixGloss(row) {
        let value = String(row.definition || '').trim().replace(/[.!?]+$/, '');
        const repeated = value.match(/^(.+?) of \{(present|base|past|adjective|plural)\}, (.+?) of \{\2\}$/i);
        const related = value.match(/^(.+?) related to \{(present|base|past|adjective|plural)\}, (.+?) of \{\2\}$/i);
        if (repeated) value = `${repeated[1]} or ${repeated[3]}`;
        else if (related) value = `${related[1]} or ${related[3]}`;
        value = value
            .replace(/\{present\}/gi, 'the stem action')
            .replace(/\{base\}/gi, 'the stem')
            .replace(/\{past\}/gi, 'the affected form')
            .replace(/\{adjective\}/gi, 'the resulting quality')
            .replace(/\{plural\}/gi, 'related forms')
            .replace(/\bresembling of\b/gi, 'resembling')
            .replace(/\s{2,}/g, ' ')
            .trim();
        return value ? value.charAt(0).toLowerCase() + value.slice(1) : '';
    }

    function makePrefixDefinition(row, forms) {
        const prefix = normalizePrefix(row.prefix);
        const builder = prefixDefinitions[prefix];
        if (builder) return builder(forms);
        const sense = prefixSense(row);
        return sense ? `To ${forms.base}, with ${prefix} contributing ${sense}.` : `A prefixed form of ${forms.base} using ${prefix}.`;
    }

    function cleanDefinition(text) {
        let value = String(text || '').trim();
        value = value.replace(/\bresembling of\b/gi, 'resembling').replace(/\s+([,.;:])/g, '$1').replace(/\s{2,}/g, ' ');
        if (!value) return '';
        value = value.charAt(0).toUpperCase() + value.slice(1);
        return /[.!?]$/.test(value) ? value : `${value}.`;
    }

    function polishDefinition(text) {
        let value = cleanDefinition(text);
        if (!value) return '';
        const mark = value.match(/[.!?]$/)?.[0] || '.';
        const body = value.replace(/[.!?]$/, '');
        const commas = (body.match(/,/g) || []).length;
        if (commas === 1 && !/,\s*(?:and|or|but|including|especially|while|rather)\b/i.test(body)) value = `${body.replace(/,\s*/, ', or ')}${mark}`;
        value = value
            .replace(/, or reconstruction of /i, ', or a reconstruction of ')
            .replace(/, or mental state of /i, ', or a mental state of ')
            .replace(/, or laws of /i, ', or the laws of ')
            .replace(/, or economy of /i, ', or the economy of ')
            .replace(/, or state of /i, ', or a state of ')
            .replace(/, or condition of /i, ', or a condition of ')
            .replace(/, or quality of /i, ', or a quality of ');
        return value;
    }

    function instantiateDefinition(template, forms) {
        let text = String(template || '').trim();
        if (!text) return `An act, state, or form associated with ${forms.present_participle || forms.base}.`;
        const replacements = {
            base: forms.base || '',
            present: forms.present_participle || forms.base || '',
            past: forms.past_participle || forms.base || '',
            adjective: forms.adjective || forms.base || '',
            plural: forms.present_singular || `${forms.base || ''}s`
        };
        for (const [key, value] of Object.entries(replacements)) text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
        return polishDefinition(text);
    }

    function morphologyLine(prefix, base, linker, suffix) {
        const parts = [];
        if (prefix) parts.push(normalizePrefix(prefix));
        if (base) parts.push(base);
        if (linker) parts.push(`-${String(linker).replace(/^-+|-+$/g, '')}-`);
        if (suffix) parts.push(`-${String(suffix).replace(/^-+/, '')}`);
        return parts.join(' ');
    }

    function morphemeMeaningLine(prefixRow, suffixRow, linker) {
        const items = [];
        if (prefixRow) {
            const gloss = prefixGloss(prefixRow);
            if (gloss) items.push(`${normalizePrefix(prefixRow.prefix)} = ${gloss}`);
        }
        if (linker) items.push(`-${String(linker).replace(/^-+|-+$/g, '')}- = combining vowel`);
        if (suffixRow) {
            const gloss = suffixGloss(suffixRow);
            if (gloss) items.push(`-${String(suffixRow.suffix).replace(/^-+/, '')} = ${gloss}`);
        }
        return items.join(' | ');
    }

    function stemBeforeVowelEnding(base) {
        if (!base) return '';
        if (/ie$/i.test(base)) return base.slice(0, -1);
        if (/e$/i.test(base) && !/(ee|ye|oe)$/i.test(base)) return base.slice(0, -1);
        return base;
    }

    function genericSuffixWord(base, ending) {
        if (!ending) return base;
        if (!base) return ending;
        if (vowels.has(ending[0].toLowerCase())) return `${stemBeforeVowelEnding(base)}${ending}`;
        return `${base}${ending}`;
    }

    function directSuffixWord(forms, suffix) {
        if (suffix === 'ing') return forms.present_participle;
        if (suffix === 'ed') return forms.past_participle;
        if (suffix === 'able') return forms.adjective;
        if (suffix === 'ability' && /able$/i.test(forms.adjective || '')) return `${forms.adjective.slice(0, -4)}ability`;
        if (suffix === 'ably' && /able$/i.test(forms.adjective || '')) return `${forms.adjective.slice(0, -4)}ably`;
        return genericSuffixWord(forms.base, suffix);
    }

    function orderedLinkers(row) {
        const ordered = [];
        const add = value => { if (value && !ordered.includes(value)) ordered.push(value); };
        row.explicitLinkers.forEach(add);
        if (!row.explicitLinkers.length && row.optionalLinkers.includes('o')) add('o');
        ordered.push('');
        row.optionalLinkers.forEach(add);
        return [...new Set(ordered)];
    }

    function suffixVariants(forms, row) {
        const variants = [];
        for (const linker of orderedLinkers(row)) {
            const word = linker ? genericSuffixWord(forms.base, `${linker}${row.suffix}`) : directSuffixWord(forms, row.suffix);
            if (word && !variants.some(item => item.word === word)) variants.push({ word, linker });
        }
        return variants;
    }

    function addConcept(bucket, key, variants, meta) {
        if (!bucket.has(key)) bucket.set(key, { forms: [], seen: new Set(), meta });
        const item = bucket.get(key);
        for (const variant of variants) {
            if (!variant || item.seen.has(variant)) continue;
            item.seen.add(variant);
            item.forms.push(variant);
        }
    }

    function generateMorphologicon(forms) {
        const bucket = new Map();

        for (const suffixRow of allData.suffixes) {
            const variants = suffixVariants(forms, suffixRow);
            const primaryLinker = variants[0]?.linker || '';
            const definition = instantiateDefinition(suffixRow.definition, forms);
            addConcept(bucket, `base||${suffixRow.suffix}||${definition}`, variants.map(item => item.word), {
                part_of_grammar: suffixRow.part_of_grammar || '', prefix_family: '', suffix: suffixRow.suffix, suffix_prefix: suffixRow.suffixPrefix || '',
                linker: primaryLinker, definition,
                analysis: morphologyLine('', forms.base, primaryLinker, suffixRow.suffix),
                morpheme_meanings: morphemeMeaningLine(null, suffixRow, primaryLinker), ...forms
            });
        }

        for (const prefixRow of allData.prefixes) {
            const prefix = normalizePrefix(prefixRow.prefix);
            const surfaces = prefixSurfaces(prefix, forms.base);
            const canonicalForms = makePrefixedForms(prefix, forms);
            const prefixVariants = surfaces.map(surface => makePrefixedForms(surface, forms).base);
            const prefixDefinition = polishDefinition(makePrefixDefinition(prefixRow, forms));
            addConcept(bucket, `${prefix}||base||${prefixDefinition}`, prefixVariants, {
                part_of_grammar: 'verb', prefix_family: prefix, suffix: '', suffix_prefix: '', linker: '', definition: prefixDefinition,
                analysis: morphologyLine(prefix, forms.base, '', ''),
                morpheme_meanings: morphemeMeaningLine(prefixRow, null, ''), ...canonicalForms, source_base: forms.base
            });

            for (const suffixRow of allData.suffixes) {
                const definition = instantiateDefinition(suffixRow.definition, canonicalForms);
                const combined = [];
                let primaryLinker = '';
                for (let i = 0; i < surfaces.length; i++) {
                    const surfaceForms = makePrefixedForms(surfaces[i], forms);
                    const variants = suffixVariants(surfaceForms, suffixRow);
                    if (i === 0) primaryLinker = variants[0]?.linker || '';
                    for (const variant of variants) combined.push(variant.word);
                }
                addConcept(bucket, `${prefix}||${suffixRow.suffix}||${definition}`, combined, {
                    part_of_grammar: suffixRow.part_of_grammar || '', prefix_family: prefix, suffix: suffixRow.suffix, suffix_prefix: suffixRow.suffixPrefix || '',
                    linker: primaryLinker, definition,
                    analysis: morphologyLine(prefix, forms.base, primaryLinker, suffixRow.suffix),
                    morpheme_meanings: morphemeMeaningLine(prefixRow, suffixRow, primaryLinker),
                    ...canonicalForms, source_base: forms.base
                });
            }
        }
        return processBucket(bucket);
    }

    function processBucket(bucket) {
        const rows = [];
        const seenForms = new Set();
        for (const value of bucket.values()) {
            const forms = [];
            const localSeen = new Set();
            for (const rawForm of value.forms) {
                const form = String(rawForm || '').trim();
                const key = form.toLowerCase();
                if (!form || localSeen.has(key) || allData.verbWordSet.has(key) || seenForms.has(key)) continue;
                localSeen.add(key);
                forms.push(form);
            }
            if (!forms.length) continue;
            forms.forEach(form => seenForms.add(form.toLowerCase()));
            rows.push({ form: forms[0], aka_forms: forms.slice(1).join(', '), ...value.meta });
        }
        return rows;
    }

    function generateAndDisplay(input) {
        if (isGenerating) return;
        setLoading(true, `Generating for "${input.base}"...`);
        setTimeout(() => {
            try {
                const forms = normalizeForms(input);
                lastResults = generateMorphologicon(forms);
                displayPrintLayout(lastResults);
            } catch (error) {
                updateStatus(`Generation Error: ${error.message}`, true);
                dom.resultsContainer.innerHTML = '<div class="placeholder">An error occurred.</div>';
            } finally { setLoading(false); }
        }, 10);
    }

    function escapeHtml(value) {
        return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function posLabel(value) {
        const normalized = String(value || '').trim().toLowerCase();
        return posLabels[normalized] || normalized || '';
    }

    function compareText(a, b) {
        return String(a || '').localeCompare(String(b || ''));
    }

    function constructionType(row) {
        if (row.prefix_family && row.suffix) return 'combined';
        if (row.prefix_family) return 'prefix';
        return 'suffix';
    }

    function sortRows(rows, mode) {
        const sorted = [...rows];
        const byForm = (a, b) => compareText(a.form, b.form);
        const compareFields = (a, b, fields) => {
            for (const field of fields) {
                const cmp = compareText(a[field], b[field]);
                if (cmp) return cmp;
            }
            return byForm(a, b);
        };
        if (mode === 'alpha') sorted.sort(byForm);
        else if (mode === 'len-asc') sorted.sort((a, b) => a.form.length - b.form.length || byForm(a, b));
        else if (mode === 'suffix-prefix-combined') {
            const order = { suffix: 0, prefix: 1, combined: 2 };
            sorted.sort((a, b) => order[constructionType(a)] - order[constructionType(b)] || compareFields(a, b, ['suffix', 'prefix_family', 'suffix_prefix', 'linker']));
        } else if (mode === 'prefix-suffix-combined') {
            const order = { prefix: 0, suffix: 1, combined: 2 };
            sorted.sort((a, b) => order[constructionType(a)] - order[constructionType(b)] || compareFields(a, b, ['prefix_family', 'suffix', 'suffix_prefix', 'linker']));
        } else if (mode === 'suffix-prefix-linker') sorted.sort((a, b) => compareFields(a, b, ['suffix', 'prefix_family', 'suffix_prefix', 'linker']));
        else if (mode === 'prefix-suffix-linker') sorted.sort((a, b) => compareFields(a, b, ['prefix_family', 'suffix', 'suffix_prefix', 'linker']));
        else if (mode === 'pos-alpha') sorted.sort((a, b) => compareFields(a, b, ['part_of_grammar', 'form']));
        else if (mode === 'construction-pos-alpha') {
            const order = { prefix: 0, suffix: 1, combined: 2 };
            sorted.sort((a, b) => order[constructionType(a)] - order[constructionType(b)] || compareFields(a, b, ['part_of_grammar', 'form']));
        } else if (mode === 'pos-construction-alpha') {
            const order = { prefix: 0, suffix: 1, combined: 2 };
            sorted.sort((a, b) => compareText(a.part_of_grammar, b.part_of_grammar) || order[constructionType(a)] - order[constructionType(b)] || byForm(a, b));
        } else if (mode === 'random') sorted.sort(() => Math.random() - 0.5);
        return sorted;
    }

    function posParts(value) {
        const normalized = String(value || '').trim().toLowerCase();
        if (!normalized) return [];
        if (normalized === 'compound noun') return ['noun'];
        return [...new Set(normalized.split(/[\/+,&]+/).map(part => part.trim()).filter(Boolean))];
    }

    function filterRows(rows) {
        const construction = dom.constructionFilter.value;
        const pos = dom.posFilter.value;
        const alternates = dom.alternateFilter.value;
        return rows.filter(row => {
            const type = constructionType(row);
            if (construction !== 'all' && type !== construction) return false;
            const parts = posParts(row.part_of_grammar);
            if (pos === 'hybrid' && parts.length < 2) return false;
            if (pos !== 'all' && pos !== 'hybrid' && !(parts.length === 1 && parts[0] === pos)) return false;
            const hasAlternates = Boolean(String(row.aka_forms || '').trim());
            if (alternates === 'with' && !hasAlternates) return false;
            if (alternates === 'without' && hasAlternates) return false;
            return true;
        });
    }

    function renderWords(text) {
        return String(text || '').split(/(\s+)/).map(part => /\s+/.test(part) ? part : `<span class="word-unit">${escapeHtml(part)}</span>`).join('');
    }

    function renderMorphology(text) {
        return String(text || '').split(/\s+/).filter(Boolean).map(part => `<span class="morph-part">${escapeHtml(part)}</span>`).join(' ');
    }

    function renderMeanings(text) {
        return String(text || '').split(' | ').filter(Boolean).map(item => {
            const split = item.indexOf(' = ');
            if (split < 0) return `<span class="meaning-item">${escapeHtml(item)}</span>`;
            const key = item.slice(0, split);
            const value = item.slice(split + 3);
            return `<span class="meaning-item"><span class="meaning-key">${escapeHtml(key)}</span> = ${renderWords(value)}</span>`;
        }).join(' · ');
    }

    function displayPrintLayout(rows) {
        if (!rows.length) {
            displayedResults = [];
            dom.resultsContainer.innerHTML = '<div class="placeholder">No new definitions generated.</div>';
            dom.downloadBtn.classList.add('hidden');
            return;
        }
        displayedResults = sortRows(filterRows(rows), dom.resultSort.value);
        if (!displayedResults.length) {
            dom.resultsContainer.innerHTML = '<div class="placeholder">No entries match the current filters.</div>';
            dom.downloadBtn.classList.add('hidden');
            updateStatus(`Displayed 0 of ${rows.length} generated forms.`);
            return;
        }
        const entries = displayedResults.map(row => {
            const label = posLabel(row.part_of_grammar);
            const main = [
                `<span class="w">${escapeHtml(row.form)}</span>`,
                label ? `<i class="p">(${escapeHtml(label)})</i>` : '',
                `<span class="d">${renderWords(row.definition)}</span>`
            ].filter(Boolean).join(' ');
            const morphology = row.analysis ? `<div class="morph-row t">${renderMorphology(row.analysis)}</div>` : '';
            const meanings = row.morpheme_meanings ? `<div class="meaning-row">${renderMeanings(row.morpheme_meanings)}</div>` : '';
            const alternateForms = String(row.aka_forms || '').split(',').map(value => value.trim()).filter(Boolean);
            const alternates = alternateForms.length ? `<div class="aka-row">[<span class="aka-label">alt.</span> <span class="aka akac">${alternateForms.map(form => `<span class="aka-form">${escapeHtml(form)}</span>`).join(', ')}</span>]</div>` : '';
            return `<div class="e"><div class="entry-main">${main}</div>${morphology}${meanings}${alternates}</div>`;
        }).join('');
        const flowClass = dom.layoutFlow.value === 'across' ? ' flow-across' : '';
        dom.resultsContainer.innerHTML = `<div class="spread${flowClass}">${entries}</div>`;
        dom.downloadBtn.classList.remove('hidden');
        updateStatus(`Displayed ${displayedResults.length} of ${rows.length} generated forms.`);
    }

    dom.downloadBtn.addEventListener('click', () => {
        if (!displayedResults.length) return;
        const activeWord = dom.wordIndex.querySelector('.active')?.dataset.word || document.getElementById('base-form').value || 'morphgen';
        const exportRows = displayedResults.map(row => ({
            ...row,
            construction_type: constructionType(row),
            display_part_of_speech: posLabel(row.part_of_grammar),
            display_flow: dom.layoutFlow.value
        }));
        const csv = Papa.unparse(exportRows);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${activeWord}_results.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    });

    dom.themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    });
    if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode');
});
