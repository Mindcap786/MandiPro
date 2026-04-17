import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'models/invoice.dart';
import 'models/receipt.dart';
import 'models/arrival.dart';
import 'models/arrival_adapters.dart';
import 'screens/main_container.dart';
import 'screens/auth/login_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Hive
  await Hive.initFlutter();
  
  // Register Adapters
  Hive.registerAdapter(InvoiceAdapter());
  Hive.registerAdapter(ReceiptAdapter());
  Hive.registerAdapter(ArrivalAdapter());
  Hive.registerAdapter(LotAdapter());

  await Hive.openBox('settings');
  await Hive.openBox('offline_transactions');
  await Hive.openBox<Invoice>('invoices');
  await Hive.openBox<Receipt>('receipts');

  // Check Session
  final settingsBox = Hive.box('settings');
  final bool isLoggedIn = settingsBox.get('is_logged_in', defaultValue: false);

  // Initialize Supabase
  await Supabase.initialize(
    url: 'https://ldayxjabzyorpugwszpt.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTMyNzgsImV4cCI6MjA4NTA4OTI3OH0.qdRruQQ7WxVfEUtWHbWy20CFgx66LBgwftvFh9ZDVIk',
  );

  runApp(MandiOSApp(isLoggedIn: isLoggedIn));
}

class MandiOSApp extends StatelessWidget {
  final bool isLoggedIn;
  const MandiOSApp({super.key, required this.isLoggedIn});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MandiOS',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: Colors.black,
        primaryColor: const Color(0xFF00FF00), // Neon Green
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF00FF00),
          secondary: Color(0xFF00FF00),
          surface: Color(0xFF1E1E1E),
        ),
        textTheme: GoogleFonts.interTextTheme(
          Theme.of(context).textTheme,
        ).apply(
          bodyColor: Colors.white,
          displayColor: Colors.white,
        ),
        useMaterial3: true,
      ),
      routes: {
        '/login': (context) => const LoginScreen(),
        '/home': (context) => const MainContainer(),
      },
      home: isLoggedIn ? const MainContainer() : const LoginScreen(),
    );
  }
}
