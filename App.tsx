import React from 'react';
import {SafeAreaView, Text, View} from 'react-native';

function App() {
  return (
    <SafeAreaView style={{flex: 1}}>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text style={{fontSize: 24}}>Winsoft Print Station</Text>
        <Text style={{marginTop: 12}}>
          React Native is working!
        </Text>
      </View>
    </SafeAreaView>
  );
}

export default App;