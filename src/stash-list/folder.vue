<template>
  <div
    :class="{
      'forest-item': true,
      selectable: true,
      folder: true,
      'action-container': true,
      'has-open-tabs': openTabsCount > 0,
      collapsed: collapsed,
      selected: folder.unfiltered.$selected,
      'no-match': !folder.isMatching,
      'has-matching-children': folder.hasMatchingChildren,
    }"
  >
    <item-icon
      v-if="!isToplevel"
      :class="{
        'forest-icon': true,
        action: true,
        select: true,
        'icon-folder': !folder.unfiltered.$selected,
        'icon-folder-selected-inverse': folder.unfiltered.$selected,
      }"
      @click.prevent.stop="select"
    />

    <a
      :class="{
        'forest-collapse': true,
        action: true,
        collapse: !collapsed,
        expand: collapsed,
      }"
      :title="`Hide the tabs for this group (hold ${altKey} to hide tabs for child folders)`"
      @click.prevent.stop="toggleCollapsed"
    />
    <ButtonBox v-if="!isRenaming && selectedCount === 0" class="forest-toolbar">
      <a
        class="action stash here"
        :title="`Stash all (or highlighted) open tabs to this group (hold ${altKey} to keep tabs open)`"
        @click.prevent.stop="stash"
      />
      <a
        class="action stash one here"
        :title="
          `Stash the active tab to this group ` +
          `(hold ${altKey} to keep tabs open)`
        "
        @click.prevent.stop="stashOne"
      />
      <a
        class="action restore"
        :title="
          `Open all tabs in this group ` +
          `(hold ${bgKey} to open in background)`
        "
        @click.prevent.stop="restoreAll"
      />
      <a
        class="action restore-remove"
        :title="
          `Open all tabs in the group and delete the group ` +
          `(hold ${bgKey} to open in background)`
        "
        @click.prevent.stop="restoreAndRemove"
      />
      <Menu
        class="menu"
        summaryClass="action neutral icon-item-menu last-toolbar-button"
        inPlace
        h-position="right"
      >
        <button
          @click.prevent="newChildFolder"
          :title="`Create a new sub-group within this group`"
        >
          <span class="icon icon-new-empty-group"></span>
          <span>New Child Group</span>
        </button>

        <button
          @click.prevent="stashToNewChildFolder"
          title="Stash all open tabs to a new child group"
        >
          <span class="icon icon-stash" />
          <span>Stash Tabs to New Child Group</span>
        </button>

        <hr />

        <button
          v-if="isToplevel"
          @click.prevent="moveSelfToChild"
          title="Move this group inside a new top-level group"
        >
          <span class="icon icon-pop-in" />
          <span>Convert to Child Group</span>
        </button>
        <button
          v-else
          @click.prevent="moveSelfToTopLevel"
          title="Move this group up to the top level"
        >
          <span class="icon icon-pop-out" />
          <span>Convert to Top-Level Group</span>
        </button>

        <template v-if="unstashedOrOpenTabs.length > 0">
          <hr />
          <div class="menu-item disabled status-text">
            <span>Stash to "{{ title }}":</span>
          </div>
          <ul class="menu-scrollable-list">
            <li v-for="t of unstashedOrOpenTabs" :key="t.tab.id">
              <a
                :href="t.tab.url"
                :title="`Stash tab to this group (hold ${altKey} to keep tab open)`"
                @click.prevent.stop="stashSpecificTab($event, t.tab)"
              >
                <item-icon is="span" :src="t.tab.favIconUrl" />
                <span>{{ t.tab.title }}</span>
                <span
                  v-if="t.stashedIn.length > 0"
                  class="icon icon-stashed status-text"
                  :title="
                    ['This tab is stashed in:', ...t.stashedIn].join('\n')
                  "
                />
              </a>
            </li>
          </ul>
        </template>

        <hr />
        <button
          @click.prevent="closeStashedTabs"
          :title="`Close any open tabs that are stashed in this group`"
        >
          <span class="icon icon-delete-stashed" />
          <span>Close Stashed Tabs</span>
        </button>
        <hr />
        <button
          title="Delete the whole group and all its sub-groups"
          @click.prevent="remove"
        >
          <span class="icon icon-delete"></span>
          <span>Delete Group</span>
        </button>
      </Menu>
    </ButtonBox>

    <ButtonBox
      v-else-if="!isRenaming && canMoveIntoFolder"
      class="forest-toolbar"
    >
      <a
        class="action stash here"
        :title="`Move ${selectedCount} selected tab(s) to this group (hold ${altKey} to copy)`"
        @click.prevent.stop="move"
      />
      <a
        class="action stash newgroup"
        :title="`Move ${selectedCount} selected tab(s) to a new sub-group (hold ${altKey} to copy)`"
        @click.prevent.stop="moveToChild"
      />
    </ButtonBox>

    <span
      v-if="!isRenaming"
      class="forest-title editable"
      :title="tooltip"
      @click.stop="isRenaming = true"
      >{{ title }}</span
    >
    <async-text-input
      v-else
      class="forest-title editable"
      :title="tooltip"
      :value="nonDefaultTitle"
      :defaultValue="defaultTitle"
      :save="rename"
      @done="isRenaming = false"
    />
  </div>

  <dnd-list
    :class="{'forest-children': true, collapsed}"
    v-model="folder.children"
    :item-key="(item: FilteredItem<Folder, Bookmark | Separator>) => item.unfiltered.id"
    :item-class="childClasses"
    :accepts="accepts"
    :drag="drag"
    :drop="drop"
  >
    <template
      #item="{item}: {item: FilteredItem<Folder, Bookmark | Separator>}"
    >
      <child-folder v-if="'children' in item" :folder="item" />
      <bookmark
        v-else-if="'url' in item.unfiltered"
        :bookmark="item as FilteredChild<Bookmark>"
      />
    </template>
  </dnd-list>

  <ul
    v-if="folder.filteredCount > 0"
    :class="{'forest-children': true, collapsed}"
  >
    <li>
      <show-filtered-item
        v-model:visible="showFiltered"
        :count="folder.filteredCount"
      />
    </li>
  </ul>
</template>

<script lang="ts">
import {defineComponent, type PropType} from "vue";

import type {DragAction, DropAction} from "../components/dnd-list";
import {
  altKeyName,
  bgKeyName,
  bgKeyPressed,
  filterMap,
  required,
} from "../util";

import type {Model, StashItem} from "../model";
import type {BookmarkMetadataEntry} from "../model/bookmark-metadata";
import type {Bookmark, Folder, Node, Separator} from "../model/bookmarks";
import {
  friendlyFolderName,
  genDefaultFolderName,
  getDefaultFolderNameISODate,
} from "../model/bookmarks";
import type {
  FilteredChild,
  FilteredItem,
  FilteredParent,
} from "../model/filtered-tree";
import type {Tab} from "../model/tabs";

import AsyncTextInput from "../components/async-text-input.vue";
import ButtonBox from "../components/button-box.vue";
import DndList from "../components/dnd-list.vue";
import ItemIcon from "../components/item-icon.vue";
import Menu from "../components/menu.vue";
import ShowFilteredItem from "../components/show-filtered-item.vue";
import BookmarkVue from "./bookmark.vue";

type NodeWithTabs = {
  node: FilteredItem<Folder, Bookmark | Separator>;
  tabs: Tab[];
};

const DROP_FORMATS = ["application/x-tab-stash-items"];

export default defineComponent({
  name: "child-folder",

  components: {
    AsyncTextInput,
    ButtonBox,
    DndList,
    Bookmark: BookmarkVue,
    ItemIcon,
    Menu,
    ShowFilteredItem,
  },

  inject: ["$model"],

  props: {
    folder: required(
      Object as PropType<FilteredParent<Folder, Bookmark | Separator>>,
    ),
    isToplevel: Boolean,
  },

  data: () => ({
    isRenaming: false,
    showFiltered: false,
  }),

  computed: {
    altKey: altKeyName,
    bgKey: bgKeyName,

    accepts() {
      return DROP_FORMATS;
    },

    metadata(): BookmarkMetadataEntry {
      return this.model().bookmark_metadata.get(this.folder.unfiltered.id);
    },

    targetWindow(): number | undefined {
      return this.model().tabs.targetWindow.value;
    },

    childrenWithTabs(): readonly NodeWithTabs[] {
      const tab_model = this.model().tabs;
      return this.folder.children.map(n => ({
        node: n,
        tabs:
          "url" in n.unfiltered && n.unfiltered.url
            ? Array.from(tab_model.tabsWithURL(n.unfiltered.url)).filter(
                t => t.windowId === this.targetWindow,
              )
            : [],
      }));
    },

    childTabStats(): {open: number; discarded: number; hidden: number} {
      let open = 0,
        discarded = 0,
        hidden = 0;
      for (const nwt of this.childrenWithTabs) {
        for (const tab of nwt.tabs) {
          if (tab.windowId !== this.targetWindow) {
            continue;
          }
          if (tab.hidden) {
            hidden += 1;
          } else if (tab.discarded) {
            discarded += 1;
          } else {
            open += 1;
          }
        }
      }
      return {open, discarded, hidden};
    },

    openTabsCount(): number {
      return this.childTabStats.open + this.childTabStats.discarded;
    },

    collapsed: {
      get(): boolean {
        return !!this.metadata.value?.collapsed;
      },
      set(collapsed: boolean) {
        this.model().bookmark_metadata.setCollapsed(
          this.metadata.key,
          collapsed,
        );
      },
    },

    // Used to populate a menu of tabs to select for stashing here
    unstashedOrOpenTabs(): {tab: Tab; stashedIn: string[]}[] {
      const model = this.model();
      const target_win = model.tabs.targetWindow.value;
      if (!target_win) return [];
      const win = model.tabs.window(target_win);
      if (!win) return [];

      return filterMap(win.tabs, id => model.tabs.tab(id))
        .filter(
          t =>
            !t.pinned &&
            !t.hidden &&
            model.isURLStashable(t.url) &&
            (!model.bookmarks.isURLStashed(t.url) ||
              model.options.sync.state.show_open_tabs !== "unstashed"),
        )
        .map(tab => ({
          tab,
          stashedIn: model.bookmarks
            .foldersInStashContainingURL(tab.url)
            .map(f => friendlyFolderName(f.title)),
        }));
    },

    /** Returns a "default" name to use if no explicit name is set.  This
     * default is typically a timestamp with one of two sources--if the
     * folder has a title that looks like a "default" title, we use that.
     * Otherwise we generate the default name from the folder's creation
     * time.
     *
     * This approach handles unnamed folders which were synced from
     * elsewhere and thus have a creation time that isn't their actual
     * creation time. */
    defaultTitle(): string {
      const unfiltered = this.folder.unfiltered;
      if (getDefaultFolderNameISODate(unfiltered.title) !== null) {
        return friendlyFolderName(unfiltered.title);
      } else {
        return `Saved ${new Date(unfiltered.dateAdded || 0).toLocaleString()}`;
      }
    },
    nonDefaultTitle(): string {
      return getDefaultFolderNameISODate(this.folder.unfiltered.title) !== null
        ? ""
        : this.folder.unfiltered.title;
    },
    title(): string {
      return friendlyFolderName(this.folder.unfiltered.title);
    },
    tooltip(): string {
      const bm_stats = this.folder.unfiltered.$stats;
      const st = this.childTabStats;
      const statstip = `${bm_stats.folderCount} sub-group${
        bm_stats.folderCount !== 1 ? "s" : ""
      }, ${bm_stats.bookmarkCount} stashed tab${
        bm_stats.bookmarkCount != 1 ? "s" : ""
      } (${st.open} open, ${st.discarded} unloaded, ${st.hidden} hidden)`;
      return `${this.title}\n${statstip}`;
    },

    leafChildren(): Bookmark[] {
      return filterMap(this.folder.children, c =>
        "url" in c.unfiltered ? c.unfiltered : undefined,
      );
    },

    selectedCount(): number {
      return this.model().selection.selectedCount.value;
    },

    canMoveIntoFolder(): boolean {
      let f: Folder | undefined = this.folder.unfiltered;
      while (f) {
        if (f.$selected) return false;
        f = this.model().bookmarks.folder(f.parentId);
      }
      return true;
    },
  },

  methods: {
    // TODO make Vue injection play nice with TypeScript typing...
    model() {
      return (<any>this).$model as Model;
    },
    attempt(fn: () => Promise<void>): Promise<void> {
      return this.model().attempt(fn);
    },

    toggleCollapsed(ev: MouseEvent) {
      if (!ev.altKey) {
        // We're just toggling ourself.
        this.collapsed = !this.collapsed;
        return;
      }

      // Toggle the collapsed state of all the child folders
      const folders = filterMap(this.folder.children, c =>
        "children" in c.unfiltered ? c.unfiltered : undefined,
      );
      if (folders.length === 0) return;

      // We just snoop on the collapsed state of the first folder because it's
      // easier
      const collapsed =
        this.model().bookmark_metadata.get(folders[0].id).value?.collapsed ||
        false;
      for (const f of folders) {
        this.model().bookmark_metadata.setCollapsed(f.id, !collapsed);
      }
    },

    select(ev: MouseEvent) {
      this.model().attempt(async () => {
        await this.model().selection.toggleSelectFromEvent(
          ev,
          this.model().bookmarks,
          this.folder.unfiltered,
        );
      });
    },

    childClasses(
      node: FilteredItem<Folder, Bookmark | Separator>,
    ): Record<string, boolean> {
      return {
        hidden: !(
          this.isValidChild(node.unfiltered) &&
          (this.showFiltered ||
            node.isMatching ||
            ("hasMatchingChildren" in node && node.hasMatchingChildren) ||
            node.unfiltered.$selected ||
            ("$recursiveStats" in node.unfiltered &&
              node.unfiltered.$recursiveStats.selectedCount))
        ),
      };
    },

    isValidChild(node: Node): node is Folder | Bookmark {
      return "url" in node || "children" in node;
    },

    stash(ev: MouseEvent | KeyboardEvent) {
      const model = this.model();
      const win_id = model.tabs.targetWindow.value;
      if (!win_id) return;

      model.attempt(
        async () =>
          await model.putItemsInFolder({
            items: model.copyIf(ev.altKey, model.stashableTabsInWindow(win_id)),
            toFolderId: this.folder.unfiltered.id,
          }),
      );
    },

    stashOne(ev: MouseEvent | KeyboardEvent) {
      const tab = this.model().tabs.activeTab();
      if (!tab) return;
      this.stashSpecificTab(ev, tab);
    },

    stashSpecificTab(ev: MouseEvent | KeyboardEvent, tab: Tab) {
      this.attempt(async () => {
        await this.model().putItemsInFolder({
          items: this.model().copyIf(ev.altKey, [tab]),
          toFolderId: this.folder.unfiltered.id,
        });
      });
    },

    moveSelfToTopLevel() {
      this.attempt(async () => {
        const model = this.model().bookmarks;
        const root = model.stash_root.value!;

        // We put it directly above its parent in the stash root, so it's easy
        // to find and continue interacting with.
        const rootPos = model
          .pathTo(this.folder.unfiltered)
          .find(p => p.parent === root);

        await model.move(
          this.folder.unfiltered.id,
          root.id,
          rootPos?.index ?? 0,
        );
      });
    },

    moveSelfToChild() {
      this.attempt(async () => {
        const model = this.model().bookmarks;
        const root = model.stash_root.value!;
        const pos = model.positionOf(this.folder.unfiltered)!;

        // Create a new parent first, positioned at our current index
        const newParent = await model.create({
          // We give the parent a default name so it will go away automatically
          // when emptied.
          title: genDefaultFolderName(new Date()),
          parentId: root.id,
          index: pos.index,
        });

        // Then move ourselves into the parent
        await model.move(this.folder.unfiltered.id, newParent.id, 0);
      });
    },

    move(ev: MouseEvent | KeyboardEvent) {
      const model = this.model();
      const win_id = model.tabs.targetWindow.value;
      if (!win_id) return;

      model.attempt(() =>
        model.putSelectedInFolder({
          copy: ev.altKey,
          toFolderId: this.folder.unfiltered.id,
        }),
      );
    },

    moveToChild(ev: MouseEvent | KeyboardEvent) {
      const model = this.model();
      const win_id = model.tabs.targetWindow.value;
      if (!win_id) return;

      model.attempt(async () => {
        const f = await model.bookmarks.create({
          parentId: this.folder.unfiltered.id,
          title: genDefaultFolderName(new Date()),
        });
        await model.putSelectedInFolder({
          copy: ev.altKey,
          toFolderId: f.id,
        });
      });
    },

    restoreAll(ev: MouseEvent | KeyboardEvent) {
      this.attempt(async () => {
        await this.model().restoreTabs(this.leafChildren, {
          background: bgKeyPressed(ev),
        });
      });
    },

    remove() {
      this.attempt(async () => {
        await this.model().deleteBookmarkTree(this.folder.unfiltered.id);
      });
    },

    restoreAndRemove(ev: MouseEvent | KeyboardEvent) {
      this.attempt(async () => {
        const bg = bgKeyPressed(ev);

        await this.model().restoreTabs(this.leafChildren, {background: bg});

        if (this.leafChildren.length === this.folder.children.length) {
          await this.model().deleteBookmarkTree(this.folder.unfiltered.id);
        } else {
          const children = this.leafChildren.map(c => c.id);
          await this.model().deleteItems(children);
        }
      });
    },

    rename(title: string) {
      return this.attempt(async () => {
        if (title === "") {
          if (
            getDefaultFolderNameISODate(this.folder.unfiltered.title) !== null
          ) {
            // It already has a default name; leave it alone so we don't
            // lose track of when the folder was actually created.
            return;
          }

          // Else give it a default name based on the creation time
          title = genDefaultFolderName(
            new Date(this.folder.unfiltered.dateAdded || 0),
          );
        }

        await this.model().bookmarks.rename(this.folder.unfiltered, title);
      });
    },

    newChildFolder() {
      return this.attempt(async () => {
        await this.model().bookmarks.create({
          parentId: this.folder.unfiltered.id,
          title: genDefaultFolderName(new Date()),
        });
      });
    },

    stashToNewChildFolder(ev: KeyboardEvent | MouseEvent) {
      this.attempt(async () => {
        const model = this.model();
        if (model.tabs.targetWindow.value === undefined) return;
        await model.stashAllTabsInWindow(model.tabs.targetWindow.value, {
          copy: ev.altKey,
          parent: this.folder.unfiltered.id,
          position: "bottom",
        });
      });
    },

    closeStashedTabs() {
      return this.attempt(async () => {
        const model = this.model();
        const openTabs = this.childrenWithTabs
          .flatMap(c => c.tabs)
          .filter(t => !t.hidden && !t.pinned);
        await model.hideOrCloseStashedTabs(openTabs.map(t => t.id));
      });
    },

    drag(ev: DragAction<FilteredItem<Folder, Bookmark | Separator>>) {
      const items = ev.value.unfiltered.$selected
        ? Array.from(this.model().selectedItems())
        : [ev.value.unfiltered];
      ev.dataTransfer.setData(
        "application/x-tab-stash-items",
        JSON.stringify(items),
      );
    },

    async drop(ev: DropAction) {
      const data = ev.dataTransfer.getData("application/x-tab-stash-items");
      const items = JSON.parse(data) as StashItem[];

      const model = this.model();
      await model.attempt(() =>
        this.model().putItemsInFolder({
          items,
          toFolderId: this.folder.unfiltered.id,
          toIndex: ev.toIndex,
        }),
      );
    },
  },
});
</script>

<style></style>
