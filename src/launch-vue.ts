// An easy way to launch a Vue application, which also applies some CSS classes
// common to every UI in Tab Stash.

// istanbul ignore file

import {browser} from 'webextension-polyfill-ts';
import {VueConstructor, ComponentOptions} from 'vue';

import {asyncEvent, resolveNamed} from './util';

import * as Options from './model/options';

export default function launch<
    V extends Vue,
    C extends VueConstructor<V>,
    O extends ComponentOptions<V, any, any, any, any>
>(
    component: C, options: () => Promise<O>,
): void {
    const loader = async function() {
        switch (new URL(document.location.href).searchParams.get('view')) {
            case 'sidebar':
                document.documentElement.classList.add('view-sidebar');
                break;
            case 'popup':
                document.documentElement.classList.add('view-popup');
                break;
            default:
                document.documentElement.classList.add('view-tab');
                break;
        }

        const plat = await resolveNamed({
            browser: browser.runtime.getBrowserInfo ?
                browser.runtime.getBrowserInfo() : {name: 'chrome'},
            platform: browser.runtime.getPlatformInfo ?
                browser.runtime.getPlatformInfo() : {os: 'unknown'},
            options: Options.live_source(),
        });

        document.documentElement.classList.add(`browser-${plat.browser.name.toLowerCase()}`);
        document.documentElement.classList.add(`os-${plat.platform.os}`);

        function updateStyle(opts: Options.SyncModel) {
            const classes = document.documentElement.classList;
            for (const c of Array.from(classes)) {
                if (c.startsWith('metrics-') || c.startsWith('theme-')) {
                    classes.remove(c);
                }
            }
            classes.add(`metrics-${opts.state.ui_metrics}`);
            classes.add(`theme-${opts.state.ui_theme}`);
        }
        updateStyle(plat.options.sync);
        plat.options.sync.onChanged.addListener(updateStyle);

        const opts = await options();
        const vue = new component(opts);
        Object.assign(<any>globalThis, {vue, vue_options: opts});
        vue.$mount('main');
    };
    window.addEventListener('load', asyncEvent(loader));
}

// Small helper function to pass our search parameters along to another sibling
// page in this extension, so the sibling page knows what environment it's in.
export function pageref(path: string): string {
    return `${path}${window.location.search}`
}
