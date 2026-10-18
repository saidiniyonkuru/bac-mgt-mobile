import { StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { AppProvider, useApp } from './src/lib/app';
import RootNavigator from './src/navigation/RootNavigator';
import LoginScreen from './src/screens/LoginScreen';
import { Loader, Logo } from './src/ui';
import { colors } from './src/ui/theme';

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: colors.primary, background: colors.bg, card: colors.surface, text: colors.text, border: colors.border, notification: colors.red },
};

function Root() {
  const { ready, session } = useApp();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 24 }}>
        <Logo size={88} />
        <View style={{ height: 40 }}>
          <Loader />
        </View>
      </View>
    );
  }
  if (!session) return <LoginScreen />;
  return (
    <NavigationContainer theme={navTheme}>
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <AppProvider>
        <Root />
      </AppProvider>
    </SafeAreaProvider>
  );
}
