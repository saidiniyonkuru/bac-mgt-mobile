import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CalendarCheck, LayoutDashboard, MoreHorizontal, Users, Wallet } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlertCounts } from '../lib/alerts';
import { RootStackParamList, TabParamList } from './types';
import { colors, fonts } from '../ui/theme';
import { haptic } from '../ui/feedback';
import { IconType } from '../ui';
import HomeScreen from '../screens/HomeScreen';
import LearnersScreen from '../screens/LearnersScreen';
import AttendanceScreen from '../screens/AttendanceScreen';
import PaymentsScreen from '../screens/PaymentsScreen';
import MoreScreen from '../screens/MoreScreen';
import LearnerProfileScreen from '../screens/LearnerProfileScreen';
import LearnerFormScreen from '../screens/LearnerFormScreen';
import PaymentFormScreen from '../screens/PaymentFormScreen';
import ExpensesScreen from '../screens/ExpensesScreen';
import ExpenseFormScreen from '../screens/ExpenseFormScreen';
import HistoryScreen from '../screens/HistoryScreen';
import ReportsScreen from '../screens/ReportsScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const tabIcon =
  (Icon: IconType) =>
  ({ color, focused }: { color: string; focused: boolean }) =>
    <Icon size={25} color={color} strokeWidth={focused ? 2.6 : 2.1} />;

const badge = (n: number) => (n > 0 ? (n > 99 ? '99+' : n) : undefined);

function Tabs() {
  const counts = useAlertCounts();
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenListeners={{ tabPress: () => haptic(8) }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12, marginTop: 2 },
        tabBarStyle: {
          height: 64 + insets.bottom,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarBadgeStyle: { backgroundColor: colors.red, fontFamily: fonts.bold, fontSize: 11, minWidth: 18, height: 18, lineHeight: 18 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: tabIcon(LayoutDashboard) }} />
      <Tab.Screen name="Learners" component={LearnersScreen} options={{ tabBarIcon: tabIcon(Users) }} />
      <Tab.Screen name="Attendance" component={AttendanceScreen} options={{ tabBarIcon: tabIcon(CalendarCheck), tabBarBadge: badge(counts.warnings) }} />
      <Tab.Screen name="Payments" component={PaymentsScreen} options={{ tabBarIcon: tabIcon(Wallet), tabBarBadge: badge(counts.unpaid) }} />
      <Tab.Screen name="More" component={MoreScreen} options={{ tabBarIcon: tabIcon(MoreHorizontal) }} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.bold, fontSize: 19 },
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="LearnerProfile" component={LearnerProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="LearnerForm" component={LearnerFormScreen} options={{ title: 'Learner', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="PaymentForm" component={PaymentFormScreen} options={{ title: 'Record payment', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="ExpenseForm" component={ExpenseFormScreen} options={{ title: 'Expense', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Expenses" component={ExpensesScreen} />
      <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'Payment History' }} />
      <Stack.Screen name="Reports" component={ReportsScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}
