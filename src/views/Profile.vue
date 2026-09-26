<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTravelStore } from '../stores/travel'
import { LUGGAGE_CATEGORIES } from '../constants'
import { formatMoney, formatDate } from '../utils/format'
import { planTotalSpend, planPackingRate } from '../services/selectors'
import StarRating from '../components/common/StarRating.vue'

const store = useTravelStore()
const router = useRouter()

const stats = computed(() => store.dashboardStats)
const unlocked = computed(() => store.achievements.filter((a) => a.unlocked))
const summarized = computed(() => store.plans.filter((p) => p.summary))

// ===== 个人物品库 =====
const libName = ref('')
const libCategory = ref(LUGGAGE_CATEGORIES[0])
const libError = ref('')

const libraryGrouped = computed(() =>
  LUGGAGE_CATEGORIES.map((cat) => ({
    cat,
    items: store.itemLibrary.filter((i) => i.category === cat),
  })).filter((g) => g.items.length > 0)
)

function addLibraryItem() {
  const name = libName.value.trim()
  if (!name) return
  if (!store.addLibraryItem(name, libCategory.value)) {
    libError.value = '物品库中已存在同名物品'
    return
  }
  libName.value = ''
  libError.value = ''
}
</script>

<template>
  <div>
    <!-- 概览 -->
    <div class="grid-3">
      <div class="card stat">
        <span class="stat-label">累计出行次数</span>
        <strong>{{ stats.totalTrips }}</strong>
      </div>
      <div class="card stat">
        <span class="stat-label">总花费</span>
        <strong>{{ formatMoney(stats.totalSpend) }}</strong>
      </div>
      <div class="card stat">
        <span class="stat-label">已解锁徽章</span>
        <strong>{{ unlocked.length }} / {{ store.totalAchievements }}</strong>
      </div>
    </div>

    <!-- 我的物品库 -->
    <div class="card mt-16">
      <h3 class="card-title">我的物品库</h3>
      <div class="lib-add">
        <input
          v-model="libName"
          class="input"
          placeholder="物品名称"
          @keyup.enter="addLibraryItem"
        />
        <select v-model="libCategory" class="select">
          <option v-for="c in LUGGAGE_CATEGORIES" :key="c" :value="c">{{ c }}</option>
        </select>
        <button type="button" class="btn btn-primary btn-sm" @click="addLibraryItem">添加</button>
      </div>
      <p v-if="libError" class="lib-error">{{ libError }}</p>
      <template v-if="libraryGrouped.length">
        <div v-for="group in libraryGrouped" :key="group.cat" class="lib-group">
          <div class="lib-group-title">{{ group.cat }}</div>
          <div class="lib-items">
            <span v-for="entry in group.items" :key="entry.id" class="lib-chip">
              {{ entry.name }}
              <button
                type="button"
                class="lib-chip-remove"
                title="从物品库删除"
                @click="store.removeLibraryItem(entry.id)"
              >×</button>
            </span>
          </div>
        </div>
        <p class="text-muted lib-tip">从库中删除不会影响已添加到计划里的物品</p>
      </template>
      <p v-else class="empty">物品库为空，在计划中添加的自定义物品会自动收录到这里</p>
    </div>

    <!-- 我的出行计划 -->
    <div class="card mt-16">
      <h3 class="card-title">我的出行计划</h3>
      <table v-if="store.plans.length" class="table">
        <thead>
          <tr><th>名称</th><th>目的地</th><th>日期</th><th>花费</th><th>打包</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in store.plans" :key="p.id" class="link-row" @click="router.push(`/plans/${p.id}`)">
            <td>{{ p.name }}</td>
            <td>{{ p.destination }}</td>
            <td>{{ formatDate(p.startDate) }} - {{ formatDate(p.endDate) }}</td>
            <td>{{ formatMoney(planTotalSpend(p)) }}</td>
            <td>{{ planPackingRate(p) }}%</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">暂无出行计划</p>
    </div>

    <!-- 出行总结 -->
    <div class="card mt-16">
      <h3 class="card-title">出行总结</h3>
      <div v-if="summarized.length" class="summary-list">
        <div v-for="p in summarized" :key="p.id" class="summary-item">
          <div>
            <strong>{{ p.name }}</strong>
            <span class="text-muted">{{ p.destination }}</span>
          </div>
          <StarRating :model-value="p.summary.rating" readonly size="16px" />
        </div>
      </div>
      <p v-else class="empty">还没有出行总结，去出行结束后撰写吧</p>
    </div>

    <!-- 成就徽章 -->
    <div class="card mt-16">
      <h3 class="card-title">我的成就徽章</h3>
      <div v-if="unlocked.length" class="badge-list">
        <div v-for="a in unlocked" :key="a.id" class="badge">
          <div class="badge-icon" :style="{ background: a.color }">{{ a.glyph }}</div>
          <div class="badge-name">{{ a.name }}</div>
        </div>
      </div>
      <p v-else class="empty">还没有解锁徽章</p>
    </div>
  </div>
</template>

<style scoped>
.stat {
  display: flex;
  flex-direction: column;
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.stat strong {
  font-size: 26px;
  margin-top: 6px;
}

.link-row {
  cursor: pointer;
}

.summary-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.summary-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--bg);
  border-radius: var(--radius-sm);
}

.summary-item div {
  display: flex;
  flex-direction: column;
}

.summary-item .text-muted {
  font-size: 13px;
}

.lib-add {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.lib-add .input {
  flex: 1;
  min-width: 120px;
}

.lib-add .select {
  width: auto;
}

.lib-error {
  color: var(--danger);
  font-size: 12px;
  margin-bottom: 8px;
}

.lib-group {
  margin-top: 12px;
}

.lib-group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.lib-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.lib-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--bg);
  border-radius: 20px;
  font-size: 13px;
}

.lib-chip-remove {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
}

.lib-chip-remove:hover {
  color: var(--danger);
}

.lib-tip {
  margin-top: 12px;
  font-size: 12px;
}
</style>
