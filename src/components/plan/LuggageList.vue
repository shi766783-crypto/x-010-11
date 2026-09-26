<script setup>
import { computed, ref } from 'vue'
import { useTravelStore } from '../../stores/travel'
import { LUGGAGE_CATEGORIES } from '../../constants'
import { luggageCompletionRate } from '../../services/luggage'
import ProgressBar from '../common/ProgressBar.vue'
import Modal from '../common/Modal.vue'

const props = defineProps({
  planId: { type: String, required: true },
  memberId: { type: String, required: true },
  memberName: { type: String, required: true },
})

const store = useTravelStore()

const plan = computed(() => store.planById(props.planId))
const list = computed(
  () => plan.value?.luggage.find((l) => l.memberId === props.memberId) || { items: [] }
)

const grouped = computed(() =>
  LUGGAGE_CATEGORIES.map((cat) => ({
    cat,
    items: (list.value.items || []).filter((i) => i.category === cat),
  })).filter((g) => g.items.length > 0)
)

const rate = computed(() => luggageCompletionRate(list.value.items))

const showAdd = ref(false)
const newName = ref('')
const newCategory = ref(LUGGAGE_CATEGORIES[0])
const saveToLibrary = ref(true)

function addCustom() {
  const name = newName.value.trim()
  if (!name) return
  store.addCustomItem(props.planId, props.memberId, name, newCategory.value, saveToLibrary.value)
  newName.value = ''
  showAdd.value = false
}

// ===== 从物品库选择 =====
const showLibrary = ref(false)
const pickedIds = ref([])

const libraryGrouped = computed(() =>
  LUGGAGE_CATEGORIES.map((cat) => ({
    cat,
    items: store.itemLibrary.filter((i) => i.category === cat),
  })).filter((g) => g.items.length > 0)
)

// 清单中已有的物品名称，用于禁用重复挑选
const existingNames = computed(() => new Set((list.value.items || []).map((i) => i.name)))

function openLibrary() {
  pickedIds.value = []
  showLibrary.value = true
}

function addPicked() {
  store.addLibraryItemsToLuggage(props.planId, props.memberId, pickedIds.value)
  showLibrary.value = false
}
</script>

<template>
  <div class="luggage-list">
    <div class="luggage-head">
      <strong>{{ memberName }}</strong>
      <span class="tag" :class="rate === 100 ? 'tag-green' : 'tag-blue'">{{ rate }}%</span>
    </div>

    <ProgressBar :value="rate" :show-label="false" />

    <div class="groups">
      <div v-for="group in grouped" :key="group.cat" class="group">
        <div class="group-title">{{ group.cat }}</div>
        <ul class="item-list">
          <li
            v-for="item in group.items"
            :key="item.id"
            class="item"
            :class="{ packed: item.packed }"
          >
            <label class="item-label">
              <input
                type="checkbox"
                :checked="item.packed"
                @change="store.togglePack(planId, memberId, item.id)"
              />
              <span class="item-name">{{ item.name }}</span>
              <span v-if="item.custom" class="item-custom">自定义</span>
            </label>
            <button
              type="button"
              class="item-remove"
              title="移除"
              @click="store.removeItem(planId, memberId, item.id)"
            >×</button>
          </li>
        </ul>
      </div>
    </div>

    <div class="add-custom">
      <template v-if="showAdd">
        <input v-model="newName" class="input" placeholder="物品名称" @keyup.enter="addCustom" />
        <select v-model="newCategory" class="select">
          <option v-for="c in LUGGAGE_CATEGORIES" :key="c" :value="c">{{ c }}</option>
        </select>
        <label class="save-lib">
          <input v-model="saveToLibrary" type="checkbox" />
          存入物品库
        </label>
        <button type="button" class="btn btn-primary btn-sm" @click="addCustom">添加</button>
        <button type="button" class="btn btn-ghost btn-sm" @click="showAdd = false">取消</button>
      </template>
      <template v-else>
        <button type="button" class="btn btn-ghost btn-sm" @click="showAdd = true">
          + 添加自定义物品
        </button>
        <button
          v-if="store.itemLibrary.length"
          type="button"
          class="btn btn-ghost btn-sm"
          @click="openLibrary"
        >
          从物品库选择
        </button>
      </template>
    </div>

    <Modal :show="showLibrary" title="从物品库选择" @close="showLibrary = false">
      <div class="lib-groups">
        <div v-for="group in libraryGrouped" :key="group.cat" class="group">
          <div class="group-title">{{ group.cat }}</div>
          <label
            v-for="item in group.items"
            :key="item.id"
            class="lib-item"
            :class="{ disabled: existingNames.has(item.name) }"
          >
            <input
              v-model="pickedIds"
              type="checkbox"
              :value="item.id"
              :disabled="existingNames.has(item.name)"
            />
            <span class="lib-name">{{ item.name }}</span>
            <span v-if="existingNames.has(item.name)" class="tag tag-gray">已添加</span>
          </label>
        </div>
      </div>
      <template #footer>
        <button type="button" class="btn btn-ghost btn-sm" @click="showLibrary = false">取消</button>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="!pickedIds.length"
          @click="addPicked"
        >
          添加到清单{{ pickedIds.length ? `（${pickedIds.length}）` : '' }}
        </button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.luggage-list {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
}

.luggage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.groups {
  margin-top: 12px;
}

.group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 12px 0 6px;
}

.item-list {
  list-style: none;
}

.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 4px;
  border-radius: 6px;
}

.item:hover {
  background: var(--bg);
}

.item-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  flex: 1;
}

.item-label input {
  accent-color: var(--primary);
  width: 16px;
  height: 16px;
}

.item.packed .item-name {
  text-decoration: line-through;
  color: var(--text-muted);
}

.item-custom {
  font-size: 11px;
  color: var(--primary);
  background: var(--primary-light);
  padding: 0 6px;
  border-radius: 4px;
}

.item-remove {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 16px;
  opacity: 0;
  transition: opacity 0.15s;
}

.item:hover .item-remove {
  opacity: 1;
}

.item-remove:hover {
  color: var(--danger);
}

.add-custom {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.add-custom .input {
  flex: 1;
  min-width: 120px;
}

.add-custom .select {
  width: auto;
}

.save-lib {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  cursor: pointer;
}

.save-lib input {
  accent-color: var(--primary);
}

.lib-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-radius: 6px;
  cursor: pointer;
}

.lib-item:hover {
  background: var(--bg);
}

.lib-item.disabled {
  cursor: not-allowed;
  color: var(--text-muted);
}

.lib-item input {
  accent-color: var(--primary);
  width: 16px;
  height: 16px;
}

.lib-item .lib-name {
  flex: 1;
}
</style>
