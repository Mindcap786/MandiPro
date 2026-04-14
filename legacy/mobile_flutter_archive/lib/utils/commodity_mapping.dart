when icclass VisualAsset {
  final String type; // 'img' or 'icon'
  final String? src;
  final String? iconName;

  VisualAsset({required this.type, this.src, this.iconName});
}

class CommodityMapping {
  static final Map<String, Map<String, dynamic>> _library = {
    'apple': {
      'aliases': ['seb', 'saib', 'aaple', 'apl', 'red apple', 'green apple'],
      'asset': VisualAsset(type: 'img', src: 'assets/3d/apple.png', iconName: 'apple')
    },
    'orange': {
      'aliases': ['kinnow', 'santru', 'mousambi', 'ornge', 'orange fruit', 'kino'],
      'asset': VisualAsset(type: 'img', src: 'assets/3d/orange.png', iconName: 'citrus')
    },
    'mango': {
      'aliases': ['aam', 'mago', 'manggo', 'alphonso', 'chaunsa'],
      'asset': VisualAsset(type: 'img', src: 'assets/3d/mango.png', iconName: 'package')
    },
    'pomegranate': {
      'aliases': ['anaar', 'pomegrante', 'pomgranate', 'anar', 'pomegranate fruit', 'pomegrnate'],
      'asset': VisualAsset(type: 'img', src: 'assets/3d/pomegranate.png', iconName: 'package')
    },
    'papaya': {
      'aliases': ['papita', 'papeeta', 'papaya fruit', 'popaya'],
      'asset': VisualAsset(type: 'img', src: 'assets/3d/papaya.png', iconName: 'package')
    },
    'kiwi': {
      'aliases': ['kiwi fruit', 'kivi', 'kiwii', 'imported kiwi', 'kiwi green', 'kiwi gold'],
      'asset': VisualAsset(type: 'img', src: 'assets/3d/kiwi.png', iconName: 'package')
    },
    'guava': {
      'aliases': ['amrood', 'gava', 'guva', 'amrud', 'peru', 'gvava', 'gwava', 'gvva', 'amrut'],
      'asset': VisualAsset(type: 'img', src: 'assets/3d/guava.png', iconName: 'package')
    },
    'grapes': {
      'aliases': ['angoor', 'angoer', 'grapes fruit', 'angoor red', 'angoor green', 'grape', 'grapess', 'graps', 'angur', 'angur red', 'angur green'],
      'asset': VisualAsset(type: 'img', src: 'assets/3d/grapes.png', iconName: 'grape')
    },
    'banana': {
      'aliases': ['kela', 'bnana', 'banana fruit'],
      'asset': VisualAsset(type: 'img', src: 'assets/3d/banana.png', iconName: 'package')
    },
    'carrot': {
      'aliases': ['gajar', 'carot', 'carat', 'red carrot'],
      'asset': VisualAsset(type: 'img', src: 'assets/3d/carrot.png', iconName: 'package')
    },
    'potato': {
      'aliases': ['aloo', 'patato', 'potatoe', 'alu'],
      'asset': VisualAsset(type: 'img', src: 'assets/3d/potato.png', iconName: 'package')
    },
    'onion': {
      'aliases': ['pyaz', 'pyaj', 'onion red', 'onion white'],
      'asset': VisualAsset(type: 'img', src: 'assets/3d/onion.png', iconName: 'package')
    },
    'tomato': {
      'aliases': ['tamatar', 'tomato fruit', 'tometo'],
      'asset': VisualAsset(type: 'img', src: 'assets/3d/tomato.png', iconName: 'package')
    },
    'watermelon': {
      'aliases': ['tarbooj', 'watermelons', 'tarbuz', 'imported watermelon'],
      'asset': VisualAsset(type: 'img', src: 'assets/3d/watermelon.png', iconName: 'package')
    },
    'pineapple': {
      'aliases': ['ananas', 'pineaple', 'imported pineapple'],
      'asset': VisualAsset(type: 'img', src: 'assets/3d/pineapple.png', iconName: 'package')
    },
  };

  static VisualAsset getVisual(String itemName) {
    final input = itemName.toLowerCase().trim();

    // 1. Direct or Alias match
    for (var entry in _library.entries) {
      final key = entry.key;
      final data = entry.value;
      if (input == key || (data['aliases'] as List).contains(input)) {
        return data['asset'] as VisualAsset;
      }
    }

    // 2. Keyword inclusion
    for (var entry in _library.entries) {
      final key = entry.key;
      final data = entry.value;
      if (input.contains(key) || (data['aliases'] as List).any((alias) => input.contains(alias))) {
        return data['asset'] as VisualAsset;
      }
    }

    // 3. Fallback
    return VisualAsset(type: 'icon', iconName: 'package');
  }
}
